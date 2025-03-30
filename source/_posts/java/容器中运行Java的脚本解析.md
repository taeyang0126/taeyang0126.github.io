---
title: java在容器中运行的脚本解析
abbrlink: 45275
date: 2025-02-23 17:46:30
tags: [JAVA, run.sh, 运行脚本]
categories: [JAVA]
---

- [run.sh](/files/java/run.sh)

### 基础运行命令
```shell
./run.sh           # 直接运行Java应用
./run.sh run       # 同上
./run.sh options   # 打印可用的Java选项
```

### 通过环境变量启用的功能
```shell
# 调试相关
export JAVA_ENABLE_DEBUG=true    # 启用远程调试
export JAVA_DEBUG_PORT=5005      # 设置调试端口(默认5005)
export JAVA_DEBUG_SUSPEND=y      # 启动时暂停等待调试器连接

# 内存相关
export JAVA_MAX_MEM_RATIO=80     # 设置最大堆内存占比(默认50%)
export JAVA_INIT_MEM_RATIO=25    # 设置初始堆内存占比

# 诊断相关
export JAVA_DIAGNOSTICS=true     # 启用诊断功能
# 效果：启用GC日志、内存跟踪等

# 代理相关
export HTTP_PROXY="http://proxy:8080"    # 设置HTTP代理
export HTTPS_PROXY="https://proxy:8080"   # 设置HTTPS代理
export NO_PROXY="localhost,127.0.0.1"     # 设置不使用代理的地址

export JAVA_APP_NAME="myapp"    # 设置进程名称
export JAVA_MAIN_CLASS="com.example.Main"  # 指定主类
export JAVA_APP_JAR="app.jar"   # 指定JAR包
```

```shell
#!/bin/sh
# ===================================================================================
# 这是一个用于在容器中运行Java应用的通用启动脚本
#
# Usage:
#    # 可以直接运行Java应用:
#    ./run.sh 参数
#
#    # 可以获取Java选项:
#    ./run.sh options
#
#
# This script will pick up either a 'fat' jar which can be run with "-jar"
# or you can sepcify a JAVA_MAIN_CLASS.
#
# 脚本来自于以下项目:
# at https://github.com/fabric8io-images/run-java-sh
#
# Env-variables evaluated in this script:
#
# JAVA_OPTIONS: Checked for already set options(设置java参数)
# JAVA_MAX_MEM_RATIO: Ratio use to calculate a default maximum Memory, in percent. 
#                     用于计算默认最大内存的比例 容器内存*JAVA_MAX_MEM_RATIO=-Xmx
#                     默认情况下容器内存<300，设置为25，超过则设置为50
#                     For a good overviews what tuning options are available -->
#                             https://youtu.be/Vt4G-pHXfs4
#                             https://www.youtube.com/watch?v=w1rZOY5gbvk
#                             https://vimeo.com/album/4133413/video/181900266
# 还请注意，堆只是 JVM 使用的内存的一小部分。还有很多
# 其他内存区域（元数据、线程、代码缓存等），这会增加整体
# 大小。当您的容器因 OOM 而终止时，您应该调整
# 绝对值。
# JAVA_INIT_MEM_RATIO：用于计算默认初始堆内存的比例（百分比）。
# 默认情况下未设置此值。
#
# 以下变量将暴露给您的 Java 应用程序：
#
# CONTAINER_MAX_MEMORY：容器的最大内存（如果在容器内运行）
# MAX_CORE_LIMIT：容器可用的内核数（如果在容器内运行）


# ==========================================================

# Fail on a single failed command in a pipeline (if supported)
# 检查并启用pipefail选项(如果支持) - 使管道中任一命令失败时整个管道都失败
(set -o | grep -q pipefail) && set -o pipefail

# 遇到错误就终止执行，使用未定义变量时报错
set -eu

# 保存所有传入的参数到ARGS变量
ARGS="$@"

# 检查是否在ksh环境
# 如果是,将local命令别名为typeset(ksh使用typeset声明局部变量)
if [ -n "${KSH_VERSION:-}" ]; then
  alias local=typeset
fi

# Error is indicated with a prefix in the return value 错误检查函数
check_error() {
  local error_msg="$1"
  if echo "${error_msg}" | grep -q "^ERROR:"; then
    echo "${error_msg}"
    exit 1
  fi
}

# The full qualified directory where this script is located in 获取脚本所在目录
script_dir() {
  # Default is current directory
  local dir=$(dirname "$0")
  local full_dir=$(cd "${dir}" && pwd)
  echo ${full_dir}
}

# Try hard to find a sane default jar-file 
# 自动检测JAR文件
auto_detect_jar_file() {
  local dir="$1"

  # Filter out temporary jars from the shade plugin which start with 'original-'
  local old_dir="$(pwd)"
  cd ${dir}
  if [ $? = 0 ]; then
    # NB: Find both (single) JAR *or* WAR <https://github.com/fabric8io-images/run-java-sh/issues/79>
    local nr_jars="$(ls 2>/dev/null | grep -e '.*\.jar$' -e '.*\.war$' | grep -v '^original-' | wc -l | awk '{print $1}')"
    if [ "${nr_jars}" = 1 ]; then
      ls 2>/dev/null | grep -e '.*\.jar$' -e '.*\.war$' | grep -v '^original-'
      exit 0
    fi
    cd "${old_dir}"
    echo "ERROR: Neither JAVA_MAIN_CLASS nor JAVA_APP_JAR is set and ${nr_jars} found in ${dir} (1 expected)"
  else
    echo "ERROR: No directory ${dir} found for auto detection"
  fi
}

# Check directories (arg 2...n) for a jar file (arg 1) 在指定目录中查找jar文件
find_jar_file() {
  local jar="$1"
  shift;

  # Absolute path check if jar specifies an absolute path
  if [ "${jar}" != ${jar#/} ]; then
    if [ -f "${jar}" ]; then
      echo "${jar}"
    else
      echo "ERROR: No such file ${jar}"
    fi
  else
    for dir in $*; do
      if [ -f "${dir}/$jar" ]; then
        echo "${dir}/$jar"
        return
      fi
    done
    echo "ERROR: No ${jar} found in $*"
  fi
}

# Generic formula evaluation based on awk 数学计算函数
calc() {
  local formula="$1"
  shift
  echo "$@" | awk '
    function ceil(x) {
      return x % 1 ? int(x) + 1 : x
    }
    function log2(x) {
      return log(x)/log(2)
    }
    function max2(x, y) {
      return x > y ? x : y
    }
    function round(x) {
      return int(x + 0.5)
    }
    {print '"int(${formula})"'}
  '
}

# Based on the cgroup limits, figure out the max number of core we should utilize 
# 计算容器的CPU核心限制
core_limit() {
  local cpu_period_file="/sys/fs/cgroup/cpu/cpu.cfs_period_us"
  local cpu_quota_file="/sys/fs/cgroup/cpu/cpu.cfs_quota_us"
  if [ -r "${cpu_period_file}" ]; then
    local cpu_period="$(cat ${cpu_period_file})"

    if [ -r "${cpu_quota_file}" ]; then
      local cpu_quota="$(cat ${cpu_quota_file})"
      # cfs_quota_us == -1 --> no restrictions
      if [ ${cpu_quota:-0} -ne -1 ]; then
        echo $(calc 'ceil($1/$2)' "${cpu_quota}" "${cpu_period}")
      fi
    fi
  fi
}

# 确定容器的最大内存限制
max_memory() {
  # High number which is the max limit until which memory is supposed to be
  # unbounded.
  local mem_file="/sys/fs/cgroup/memory/memory.limit_in_bytes"
  if [ -r "${mem_file}" ]; then
    local max_mem_cgroup="$(cat ${mem_file})"
    local max_mem_meminfo_kb="$(cat /proc/meminfo | awk '/MemTotal/ {print $2}')"
    local max_mem_meminfo="$(expr $max_mem_meminfo_kb \* 1024)"
    if [ ${max_mem_cgroup:-0} != -1 ] && [ ${max_mem_cgroup:-0} -lt ${max_mem_meminfo:-0} ]
    then
      echo "${max_mem_cgroup}"
    fi
  fi
}

# 初始化容器限制相关的环境变量
# 获取并设置CPU核心限制，获取并设置内存限制，这些变量后续会被Java应用使用
init_limit_env_vars() {
  # Read in container limits and export the as environment variables
  local core_limit="$(core_limit)"
  if [ -n "${core_limit}" ]; then
    export CONTAINER_CORE_LIMIT="${core_limit}"
  fi

  local mem_limit="$(max_memory)"
  if [ -n "${mem_limit}" ]; then
    export CONTAINER_MAX_MEMORY="${mem_limit}"
  fi
}

# 获取Java主版本号
init_java_major_version() {
    # Initialize JAVA_MAJOR_VERSION variable if missing
    if [ -z "${JAVA_MAJOR_VERSION:-}" ]; then
        local full_version=""

        # Parse JAVA_VERSION variable available in containers
        if [ -n "${JAVA_VERSION:-}" ]; then
            full_version="$JAVA_VERSION"
        elif [ -n "${JAVA_HOME:-}" ] && [ -r "${JAVA_HOME}/release" ]; then
            full_version="$(grep -e '^JAVA_VERSION=' ${JAVA_HOME}/release | sed -e 's/.*\"\([0-9.]\{1,\}\).*/\1/')"
        else
            full_version=$(java -version 2>&1 | head -1 | sed -e 's/.*\"\([0-9.]\{1,\}\).*/\1/')
        fi
        export JAVA_MAJOR_VERSION=$(echo $full_version | sed -e 's/[^0-9]*\(1\.\)\{0,1\}\([0-9]\{1,\}\).*/\2/')
    fi
}

# 加载环境配置
load_env() {
  local script_dir="$1"

  # Configuration stuff is read from this file
  local run_env_sh="run-env.sh"

  # Load default default config
  if [ -f "${script_dir}/${run_env_sh}" ]; then
    . "${script_dir}/${run_env_sh}"
  fi

  # Check also $JAVA_APP_DIR. Overrides other defaults
  # It's valid to set the app dir in the default script
  JAVA_APP_DIR="${JAVA_APP_DIR:-${script_dir}}"
  if [ -f "${JAVA_APP_DIR}/${run_env_sh}" ]; then
    . "${JAVA_APP_DIR}/${run_env_sh}"
  fi
  export JAVA_APP_DIR

  # JAVA_LIB_DIR defaults to JAVA_APP_DIR
  export JAVA_LIB_DIR="${JAVA_LIB_DIR:-${JAVA_APP_DIR}}"
  if [ -z "${JAVA_MAIN_CLASS:-}" ] && [ -z "${JAVA_APP_JAR:-}" ]; then
    JAVA_APP_JAR="$(auto_detect_jar_file ${JAVA_APP_DIR})"
    check_error "${JAVA_APP_JAR}"
  fi

  if [ -n "${JAVA_APP_JAR:-}" ]; then
    local jar="$(find_jar_file ${JAVA_APP_JAR} ${JAVA_APP_DIR} ${JAVA_LIB_DIR})"
    check_error "${jar}"
    export JAVA_APP_JAR="${jar}"
  else
    export JAVA_MAIN_CLASS
  fi
}

# Check for standard /opt/run-java-options first, fallback to run-java-options in the path if not existing
# 获取Java运行选项(优先 /opt/run-java-options)
run_java_options() {
  if [ -f "/opt/run-java-options" ]; then
    echo "$(. /opt/run-java-options)"
  else
    which run-java-options >/dev/null 2>&1
    if [ $? = 0 ]; then
      echo "$(run-java-options)"
    fi
  fi
}

# 设置java debug，远程debug
# JAVA_ENABLE_DEBUG = true
debug_options() {
  if [ -n "${JAVA_ENABLE_DEBUG:-}" ] || [ -n "${JAVA_DEBUG_ENABLE:-}" ] ||  [ -n "${JAVA_DEBUG:-}" ]; then
	  local debug_port="${JAVA_DEBUG_PORT:-5005}"
    local suspend_mode="n"
    if [ -n "${JAVA_DEBUG_SUSPEND:-}" ]; then
      if ! echo "${JAVA_DEBUG_SUSPEND}" | grep -q -e '^\(false\|n\|no\|0\)$'; then
        suspend_mode="y"
      fi
    fi

    local address_prefix=""
	  if [ "${JAVA_MAJOR_VERSION:-0}" -ge "9" ]; then
      address_prefix="*:"
	  fi
	  echo "-agentlib:jdwp=transport=dt_socket,server=y,suspend=${suspend_mode},address=${address_prefix}${debug_port}"
  fi
}

# Read in a classpath either from a file with a single line, colon separated
# or given line-by-line in separate lines
# Arg 1: path to claspath (must exist), optional arg2: application jar, which is stripped from the classpath in
# multi line arrangements
format_classpath() {
  local cp_file="$1"
  local app_jar="${2:-}"

  local wc_out="$(wc -l $1 2>&1)"
  if [ $? -ne 0 ]; then
    echo "Cannot read lines in ${cp_file}: $wc_out"
    exit 1
  fi

  local nr_lines=$(echo $wc_out | awk '{ print $1 }')
  if [ ${nr_lines} -gt 1 ]; then
    local sep=""
    local classpath=""
    while read file; do
      local full_path="${JAVA_LIB_DIR}/${file}"
      # Don't include app jar if include in list
      if [ "${app_jar}" != "${full_path}" ]; then
        classpath="${classpath}${sep}${full_path}"
      fi
      sep=":"
    done < "${cp_file}"
    echo "${classpath}"
  else
    # Supposed to be a single line, colon separated classpath file
    cat "${cp_file}"
  fi
}

# ==========================================================================

memory_options() {
  echo "$(calc_init_memory) $(calc_max_memory)"
  return
}

# Check for memory options and set max heap size if needed
# 根据不同条件自动计算并设置JVM的最大堆内存(-Xmx参数)
# 主要逻辑：
# 优先级判断：
# 如果用户已在JAVA_OPTIONS中设置了-Xmx，则保持用户设置
# 如果没有设置容器最大内存(CONTAINER_MAX_MEMORY)，则不进行设置
# 堆内存计算规则(按优先级)：
# 如果设置了JAVA_MAX_MEM_RATIO：使用指定比例计算
# 如果是Java 10+且未设置JAVA_MAX_MEM_RATIO：不设置最大内存
# 如果容器内存 ≤ 300MB：设为容器内存的25%
# 如果容器内存 > 300MB：设为容器内存的50%
calc_max_memory() {
  # Check whether -Xmx is already given in JAVA_OPTIONS
  if echo "${JAVA_OPTIONS:-}" | grep -q -- "-Xmx"; then
    return
  fi

  if [ -z "${CONTAINER_MAX_MEMORY:-}" ]; then
    return
  fi

  # Check for the 'real memory size' and calculate Xmx from the ratio
  if [ -n "${JAVA_MAX_MEM_RATIO:-}" ]; then
    if [ "${JAVA_MAX_MEM_RATIO}" -eq 0 ]; then
      # Explicitely switched off
      return
    fi
    calc_mem_opt "${CONTAINER_MAX_MEMORY}" "${JAVA_MAX_MEM_RATIO}" "mx"
  # When JAVA_MAX_MEM_RATIO not set and JVM >= 10 no max_memory
  elif [ "${JAVA_MAJOR_VERSION:-0}" -ge "10" ]; then
    return
  elif [ "${CONTAINER_MAX_MEMORY}" -le 314572800 ]; then
    # Restore the one-fourth default heap size instead of the one-half below 300MB threshold
    # See https://docs.oracle.com/javase/8/docs/technotes/guides/vm/gctuning/parallel.html#default_heap_size
    calc_mem_opt "${CONTAINER_MAX_MEMORY}" "25" "mx"
  else
    calc_mem_opt "${CONTAINER_MAX_MEMORY}" "50" "mx"
  fi
}

# Check for memory options and set initial heap size if requested
#calc_init_memory 的核心功能：计算并设置JVM的初始堆内存大小(-Xms参数)。
#判断逻辑(按优先级)：
#如果JAVA_OPTIONS中已有-Xms，使用用户设置
#如果未设置JAVA_INIT_MEM_RATIO或容器内存，不设置
#如果设置了上述参数，用公式计算：初始堆内存 = 容器内存 × (JAVA_INIT_MEM_RATIO/100)
calc_init_memory() {
  # Check whether -Xms is already given in JAVA_OPTIONS.
  if echo "${JAVA_OPTIONS:-}" | grep -q -- "-Xms"; then
    return
  fi

  # Check if value set
  if [ -z "${JAVA_INIT_MEM_RATIO:-}" ] || [ -z "${CONTAINER_MAX_MEMORY:-}" ] || [ "${JAVA_INIT_MEM_RATIO}" -eq 0 ]; then
    return
  fi

  # Calculate Xms from the ratio given
  calc_mem_opt "${CONTAINER_MAX_MEMORY}" "${JAVA_INIT_MEM_RATIO}" "ms"
}

# -Xmx -Xms
calc_mem_opt() {
  local max_mem="$1"
  local fraction="$2"
  local mem_opt="$3"

  local val=$(calc 'round($1*$2/100/1048576)' "${max_mem}" "${fraction}")
  echo "-X${mem_opt}${val}m"
}

# 当容器内存 ≤ 300MB (314572800字节) 时，禁用C2编译器
# 其他情况启用
c2_disabled() {
  if [ -n "${CONTAINER_MAX_MEMORY:-}" ]; then
    # Disable C2 compiler when container memory <=300MB
    if [ "${CONTAINER_MAX_MEMORY}" -le 314572800 ]; then
      echo true
      return
    fi
  fi
  echo false
}

#jit_options 函数决定JVM的即时编译器(JIT)级别：
#判断流程：
#Java 10+ 不处理
#如果JAVA_OPTIONS已有TieredStopAtLevel配置则用用户配置
#内存≤300MB时，返回 -XX:TieredStopAtLevel=1，只用C1编译器节省内存
jit_options() {
  if [ "${JAVA_MAJOR_VERSION:-0}" -ge "10" ]; then
    return
  fi
  # Check whether -XX:TieredStopAtLevel is already given in JAVA_OPTIONS
  if echo "${JAVA_OPTIONS:-}" | grep -q -- "-XX:TieredStopAtLevel"; then
    return
  fi
  if [ $(c2_disabled) = true ]; then
    echo "-XX:TieredStopAtLevel=1"
  fi
}

# Switch on diagnostics except when switched off
# Java 11+版本：
# -XX:NativeMemoryTracking=summary  // 跟踪JVM本地内存使用
# -Xlog:gc*:stdout:time            // 统一日志格式输出GC日志
# -XX:+UnlockDiagnosticVMOptions   // 解锁诊断选项

# Java 11以下版本
#-XX:NativeMemoryTracking=summary  // 跟踪JVM本地内存使用
#-XX:+PrintGC                      // 打印GC信息
#-XX:+PrintGCDateStamps           // 打印GC时间戳
#-XX:+PrintGCTimeStamps           // 打印GC耗时
#-XX:+UnlockDiagnosticVMOptions   // 解锁诊断选项
diagnostics_options() {
  if [ -n "${JAVA_DIAGNOSTICS:-}" ]; then
    if [ "${JAVA_MAJOR_VERSION:-0}" -ge "11" ]; then
      echo "-XX:NativeMemoryTracking=summary -Xlog:gc*:stdout:time -XX:+UnlockDiagnosticVMOptions"
    else
      echo "-XX:NativeMemoryTracking=summary -XX:+PrintGC -XX:+PrintGCDateStamps -XX:+PrintGCTimeStamps -XX:+UnlockDiagnosticVMOptions"
    fi
  fi
}

# Replicate thread ergonomics for tiered compilation.
# This could ideally be skipped when tiered compilation is disabled.
# The algorithm is taken from:
# OpenJDK / jdk8u / jdk8u / hotspot
# src/share/vm/runtime/advancedThresholdPolicy.cpp
ci_compiler_count() {
  local core_limit="$1"
  local log_cpu=$(calc 'log2($1)' "$core_limit")
  local loglog_cpu=$(calc 'log2(max2($1,1))' "$log_cpu")
  local count=$(calc 'max2($1*$2,1)*3/2' "$log_cpu" "$loglog_cpu")
  local c1_count=$(calc 'max2($1/3,1)' "$count")
  local c2_count=$(calc 'max2($1-$2,1)' "$count" "$c1_count")
  [ $(c2_disabled) = true ] && echo "$c1_count" || echo $(calc '$1+$2' "$c1_count" "$c2_count")
}

#Java 10+ 不处理(因为能自动识别容器CPU限制)
#当设置了容器CPU限制时，配置以下参数
#-XX:ParallelGCThreads=核心数     // 并行GC线程数
#-XX:ConcGCThreads=核心数        // 并发GC线程数
#-Djava.util.concurrent.ForkJoinPool.common.parallelism=核心数  // ForkJoin池线程数
#-XX:CICompilerCount=动态计算值   // JIT编译器线程数
cpu_options() {
  # JVMs >= 10 know about CPU limits
  if [ "${JAVA_MAJOR_VERSION:-0}" -ge "10" ]; then
    return
  fi

  local core_limit="${JAVA_CORE_LIMIT:-}"
  if [ "$core_limit" = "0" ]; then
    return
  fi

  if [ -n "${CONTAINER_CORE_LIMIT:-}" ]; then
    if [ -z ${core_limit} ]; then
      core_limit="${CONTAINER_CORE_LIMIT}"
    fi
    echo "-XX:ParallelGCThreads=${core_limit} " \
         "-XX:ConcGCThreads=${core_limit} " \
         "-Djava.util.concurrent.ForkJoinPool.common.parallelism=${core_limit} " \
         "-XX:CICompilerCount=$(ci_compiler_count $core_limit)"
  fi
}

#-XX:MinHeapFreeRatio=20  These parameters tell the heap to shrink aggressively and to grow conservatively.
#-XX:MaxHeapFreeRatio=40  Thereby optimizing the amount of memory available to the operating system.
heap_ratio() {
  echo "-XX:MinHeapFreeRatio=20 -XX:MaxHeapFreeRatio=40"
}

# These parameters are necessary when running parallel GC if you want to use the Min and Max Heap Free ratios.
# Skip setting gc_options if any other GC is set in JAVA_OPTIONS.
# -XX:GCTimeRatio=4
# -XX:AdaptiveSizePolicyWeight=90
# 如果用户已配置GC(比如-XX:UseG1GC)则不处理
# 对Java 10以下版本
#-XX:+UseParallelGC                  # 使用并行GC
#-XX:GCTimeRatio=4                   # GC时间占比不超过20%
#-XX:AdaptiveSizePolicyWeight=90     # GC自适应策略权重
#$(heap_ratio)                       # 堆内存比例配置
# 非Java7版本 -XX:+ExitOnOutOfMemoryError        # OOM时直接退出JVM
gc_options() {
  if echo "${JAVA_OPTIONS:-}" | grep -q -- "-XX:.*Use.*GC"; then
    return
  fi

  local opts=""
  # for JVMs < 10 set GC settings
  if [ -z "${JAVA_MAJOR_VERSION:-}" ] || [ "${JAVA_MAJOR_VERSION:-0}" -lt "10" ]; then
    opts="${opts} -XX:+UseParallelGC -XX:GCTimeRatio=4 -XX:AdaptiveSizePolicyWeight=90 $(heap_ratio)"
  fi
  if [ -z "${JAVA_MAJOR_VERSION:-}" ] || [ "${JAVA_MAJOR_VERSION:-}" != "7" ]; then
    opts="${opts} -XX:+ExitOnOutOfMemoryError"
  fi
  echo $opts
}

java_default_options() {
  # Echo options, trimming trailing and multiple spaces
  echo "$(memory_options) $(jit_options) $(diagnostics_options) $(cpu_options) $(gc_options)" | awk '$1=$1'

}

# ==============================================================================

# parse the URL
parse_url() {
  #[scheme://][user[:password]@]host[:port][/path][?params]
  echo "$1" | sed -e "s+^\(\([^:]*\)://\)\?\(\([^:@]*\)\(:\([^@]*\)\)\?@\)\?\([^:/?]*\)\(:\([^/?]*\)\)\?.*$+ local scheme='\2' username='\4' password='\6' hostname='\7' port='\9'+"
}

java_proxy_options() {
  local url="$1"
  local transport="$2"
  local ret=""

  if [ -n "$url" ] ; then
    eval $(parse_url "$url")
    if [ -n "$hostname" ] ; then
      ret="-D${transport}.proxyHost=${hostname}"
    fi
    if [ -n "$port" ] ; then
      ret="$ret -D${transport}.proxyPort=${port}"
    fi
    if [ -n "$username" -o -n "$password" ] ; then
      echo "WARNING: Proxy URL for ${transport} contains authentication credentials, these are not supported by java" >&2
    fi
  fi
  echo "$ret"
}

# Check for proxy options and echo if enabled.
proxy_options() {
  local ret=""
  ret="$(java_proxy_options "${https_proxy:-${HTTPS_PROXY:-}}" https)"
  ret="$ret $(java_proxy_options "${http_proxy:-${HTTP_PROXY:-}}" http)"

  local noProxy="${no_proxy:-${NO_PROXY:-}}"
  if [ -n "$noProxy" ] ; then
    ret="$ret -Dhttp.nonProxyHosts=$(echo "|$noProxy" | sed -e 's/,[[:space:]]*/|/g' | sed -e 's/[[:space:]]//g' | sed -e 's/|\./|\*\./g' | cut -c 2-)"
  fi
  echo "$ret"
}

# ==============================================================================

# Set process name if possible
exec_args() {
  EXEC_ARGS=""
  if [ -n "${JAVA_APP_NAME:-}" ]; then
    # Not all shells support the 'exec -a newname' syntax..
    if $(exec -a test true 2>/dev/null); then
      echo "-a '${JAVA_APP_NAME}'"
    fi
  fi
}

# Combine all java options
java_options() {
  # Normalize spaces with awk (i.e. trim and elimate double spaces)
  # See e.g. https://www.physicsforums.com/threads/awk-1-1-1-file-txt.658865/ for an explanation
  # of this awk idiom
  echo "${JAVA_OPTIONS:-} $(run_java_options) $(debug_options) $(proxy_options) $(java_default_options)" | awk '$1=$1'
}

# Fetch classpath from env or from a local "run-classpath" file
classpath() {
  local cp_path="."
  if [ "${JAVA_LIB_DIR}" != "${JAVA_APP_DIR}" ]; then
    cp_path="${cp_path}:${JAVA_LIB_DIR}"
  fi
  if [ -z "${JAVA_CLASSPATH:-}" ] && [ -n "${JAVA_MAIN_CLASS:-}" ]; then
    if [ -n "${JAVA_APP_JAR:-}" ]; then
      cp_path="${cp_path}:${JAVA_APP_JAR}"
    fi
    if [ -f "${JAVA_LIB_DIR}/classpath" ]; then
      # Classpath is pre-created and stored in a 'run-classpath' file
      cp_path="${cp_path}:$(format_classpath ${JAVA_LIB_DIR}/classpath ${JAVA_APP_JAR:-})"
    else
      # No order implied
      cp_path="${cp_path}:${JAVA_APP_DIR}/*"
    fi
  elif [ -n "${JAVA_CLASSPATH:-}" ]; then
    # Given from the outside
    cp_path="${JAVA_CLASSPATH}"
  fi
  echo "${cp_path}"
}

# Checks if a flag is present in the arguments.
hasflag() {
    local filters="$@"
    for var in $ARGS; do
        for filter in $filters; do
          if [ "$var" = "$filter" ]; then
              echo 'true'
              return
          fi
        done
    done
}

# ==============================================================================
# 开启对应的配置
options() {
    if [ -z ${1:-} ]; then
      java_options
      return
    fi

    local ret=""
    if [ $(hasflag --debug) ]; then
      ret="$ret $(debug_options)"
    fi
    if [ $(hasflag --proxy) ]; then
      ret="$ret $(proxy_options)"
    fi
    if [ $(hasflag --java-default) ]; then
      ret="$ret $(java_default_options)"
    fi
    if [ $(hasflag --memory) ]; then
      ret="$ret $(memory_options)"
    fi
    if [ $(hasflag --jit) ]; then
      ret="$ret $(jit_options)"
    fi
    if [ $(hasflag --diagnostics) ]; then
      ret="$ret $(diagnostics_options)"
    fi
    if [ $(hasflag --cpu) ]; then
      ret="$ret $(cpu_options)"
    fi
    if [ $(hasflag --gc) ]; then
      ret="$ret $(gc_options)"
    fi

    echo $ret | awk '$1=$1'
}

# Start JVM
run() {
  # Initialize environment
  load_env $(script_dir)

  local args
  cd ${JAVA_APP_DIR}
  if [ -n "${JAVA_MAIN_CLASS:-}" ] ; then
     args="${JAVA_MAIN_CLASS}"
  elif [ -n "${JAVA_APP_JAR:-}" ]; then
     args="-jar ${JAVA_APP_JAR}"
  else
     echo "Either JAVA_MAIN_CLASS or JAVA_APP_JAR needs to be given"
     exit 1
  fi

  if [ "${HIDE_CMD_LINE:-}" != 1 ] && [ "${HIDE_CMD_LINE:-}" != true ]; then
    echo exec $(exec_args) java $(java_options) -cp "$(classpath)" ${args} "$@"
  fi

  # Don't put ${args} in quotes, otherwise it would be interpreted as a single arg.
  # However it could be two args (see above). zsh doesn't like this btw, but zsh is not
  # supported anyway.
  exec $(exec_args) java $(java_options) -cp "$(classpath)" ${args} "$@"
}

# =============================================================================
# Fire up

# Initialize JAVA_MAJOR_VERSION variable if missing
init_java_major_version

# Set env vars reflecting limits
init_limit_env_vars

first_arg=${1:-}
if [ "${first_arg}" = "options" ]; then
  # Print out options only
  shift
  options $@
  exit 0
elif [ "${first_arg}" = "run" ]; then
  # Run is the default command, but can be given to allow "options"
  # as first argument to your
  shift
fi
run "$@"

```
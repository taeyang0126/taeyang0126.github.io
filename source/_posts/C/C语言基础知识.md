---
title: C语言基础知识
tags:
  - C
categories:
  - C
abbrlink: 17349
date: 2025-02-10 14:51:22
---



### 指针

- **&** 获取变量地址
- ***** 说明变量为指针变量，存储的是另一个变量的地址；***p** 若p本身已经是地址，那么能获取到这个地址对应的值
- 多级指针使用多个 ***** 表示
- 数组名不代表整个数组，只代表数组首元素的地址，对这个**地址+1**即可获取数组下一个元素的地址
- **char** **string[]** 数组定义字符串，**char\*** **str** **= "x"** 指针定义字符串
- 函数指针，函数名代表函数的地址。定义函数指针技巧如下: 
  - 把要指向函数头拷贝过来
  - 把函数名称使用小括号括起来
  - 在函数名称前面加上一个 *
  - 修改函数名称

```C
#include <stdio.h>
#include <string.h>

int sum(int a, int b)
{
    return a + b;
}

int multi(int a, int b)
{
    return a * b;
}

// 计算func结果，并打印
int printFunc(char *prefix, int (*func)(int a, int b), int a, int b)
{
    int c = func(a, b);
    printf("[%d %s %d] = %d\n", a, prefix, b, c);
    return c;
}

int main(void)
{
    // a 是一个变量，直接获取a那么得到的是具体的值也就是1
    // 怎么获取变量a的地址呢？&a
    int a = 1;

    // 现在可以使用一个指针变量指向a的地址，而不是a
    int* b = &a;
    // 这里表示直接获取变量b的值，我们知道变量b存储的是地址，所以这里显示的地址
    printf("b: %p\n", b);
    // 怎么通过这个地址获取到地址指向的值呢？使用 *
    printf("b: %d\n", *b);

    // 二级指针，此变量存放的也是地址，但是不是具体变量的地址，而是一个指针的地址
    int** c = &b;
    printf("c: %p\n", c);
    printf("c: %p\n", *c);
    printf("c: %d\n", **c);

    // 数组名d不代表整个数组,只代表数组首元素的地址
    int d[3] = {1, 2, 3};
    printf("d: %p\n", d);
    int* p = d;
    printf("p: %p\n", p);
    printf("p0: %d\n", *(p));
    printf("p1: %d\n", *(p + 1));
    printf("p2: %d\n", *(p + 2));

    // 定义字符串
    // 1. 使用数组
    char string[] = "我是...";
    printf("s: %s\n", string);
    // 2. 字符串指针指向字符串
    // 用字符指针来保存字符串,它保存的是字符串常量地址,常量区是只读的,所以我们不可以修改字符串中的字符
    char* str = "xxxyyyy...";
    printf("str: %p\n", str);
    printf("str: %s\n", str);
    for (int i = 0; i < strlen(str); ++i)
    {
        printf("%c", *(str + i));
    }
    printf("\n");

    // 函数指针
    // 函数作为一段程序，在内存中也要占据部分存储空间，它也有一个起始地址
    // 因此可以利用一个指针指向一个函数。其中，函数名就代表着函数的地址
    // 具体格式就是 返回值 指针变量 参数
    // 指针函数定义技巧
    // 1、 把要指向函数头拷贝过来
    // 2、 把函数名称使用小括号括起来
    // 3、 在函数名称前面加上一个 *
    // 4、 修改函数名称
    int (*add)(int, int);
    add = sum;
    printf("add: %p\n", add);
    printf("add result: %d\n", add(1, 2));
    // 计算并打印
    printFunc("add", add, 2, 3);
    printFunc("multi", multi, 2, 3);
}
```

### 结构体

- 结构体中没有初始化的属性可能有垃圾值，这是因为内存没有初始化导致的，建议结构体中内嵌的结构体使用指针的形式，便于使用NULL定义
- 结构体之间赋值是值拷贝, 而不是地址传递
- 结构体变量作为函数形参时也是值传递, 在函数内修改形参, 不会影响外界实参
- sizeof计算普通结构体变量，计算的是结构体整体占用的内存大小；计算指针则是指针本身占用的内存大小
- 共用体 union 内部所有属性共享一块内存，其中一个属性发生变化，其他属性也会改变

```C
#include <stdio.h>

struct Date
{
    int month;
    int day;
    int year;
};

typedef struct Student
{
    char* name;
    int age;
    struct Date birthday;
} Student;

void printStudent(const Student* student)
{
    printf("name:%s,age:%d,", student->name, student->age);
    struct Date birthday = student->birthday;
    printf("birthday:%d-%d-%d\n", birthday.year, birthday.month, birthday.day);
}

union Test
{
    int age;
    char a;
};

int main(void)
{
    // 先定义再初始化
    // struct Student student 这里会为整个结构体分配内存，包含内部的三个属性
    struct Student student;
    // memset(&student, 0, sizeof(&student));
    student.age = 10;
    student.name = "123";
    printStudent(&student);
    // 打印没有初始化的birthday属性，会发现有值
    // 这些值是尚未初始化的内存，是内存中原本就有的数据，属于垃圾值
    // 这时候可以考虑使用指针，设置为NULL即可
    struct Date birthday = student.birthday;
    printf("birthday:%d-%d-%d\n", birthday.year, birthday.month, birthday.day);


    // 初始化的时候定义
    const struct Student stu = {.name = "name", .age = 29};
    printStudent(&stu);

    // 先定义后一次初始化
    struct Student stu2;
    stu2 = (struct Student){"lnj", 35};
    printStudent(&stu2);

    // 定义包含结构体的结构体
    struct Student stu3 = {.name = "name3", .age = 20, .birthday = {.year = 2024, .month = 10, .day = 22}};
    printStudent(&stu3);

    // 结构体之间赋值是值拷贝, 而不是地址传递
    // 同理 结构体变量作为函数形参时也是值传递, 在函数内修改形参, 不会影响外界实参
    // 这个跟java不一样，java中只要不是基本对象，其他都是拷贝地址，而不是值拷贝
    struct Student copyStudent = student;
    printf("age1:%d, age2:%d\n", student.age, copyStudent.age);
    // 发现copyStudent对应的数据变化了，但是student数据没有改变
    copyStudent.age = 20;
    printf("age1:%d, age2:%d\n", student.age, copyStudent.age);

    // sizeof
    // 这里计算的是普通变量，也就是整个结构体的大小=24
    printf("sizeof: %lu\n", sizeof(student));
    // 这里计算的是指针变量，也就是计算这个指针变量本身的大小，在64位机器上是8个byte
    printf("sizeof: %lu\n", sizeof(&student));

    // 使用typeof定义的名称访问
    Student studentx = {.name = "x"};
    printf("name: %s", studentx.name);

    // 共用体，内部所有的属性占用同一块内存，修改某个属性会影响到其他属性
    // 通信中的数据包会用到共用体，因为不知道对方会发送什么样的数据包过来，用共用体的话就简单了，定义几种格式的包，收到包之后就可以根据包的格式取出数据
    // 节约内存。如果有2个很长的数据结构，但不会同时使用
    // 某些应用需要大量的临时变量，这些变量类型不同，而且会随时更换。而你的堆栈空间有限，不能同时分配那么多临时变量。这时可以使用共用体让这些变量共享同一个内存空间，这些临时变量不用长期保存，用完即丢，和寄存器差不多，不用维护
    union Test t;
    // 发现这个共用体占用的内存是4，也就是其中某个属性占用内存的最大值
    printf("sizeof union: %lu\n", sizeof(t));
    t.age = 33;
    printf("t.age = %i\n", t.age); // 33
    t.a = 'a';
    printf("t.ch = %c\n", t.a); // a
    // 修改属性a发现age属性也变化了
    printf("t.age = %i\n", t.age); // 97

    return 0;
}
```

### 宏

- 源程序中所有的宏在编译预处理的时候都会进行文本替换
- 定义一个宏时可以引用已经定义的宏名
- 可用宏定义表示数据类型,使书写方便  `#define String char*`
- 带参数的宏定义
  - C语言允许宏带有参数。在宏定义中的参数称为形式参数,在宏调用中的参数称为实际参数。对带参数的宏,在调用中,不仅要宏展开,而且要用实参去代换形参
  - 格式: #define 宏名(形参表) 字符串
  - 1. 宏名和参数列表之间不能有空格，否则空格后面的所有字符串都作为替换的字符串.
  - 2. 带参数的宏在展开时，只作简单的字符和参数的替换，不进行任何计算操作。所以在定义宏时，一般用一个小括号括住字符串的参数
  - 3. 计算结果最好也用括号括起来，避免出现一些优先的问题 #define Pow(a) ( (a) * (a) )
- 条件编译

> 希望程序的其中一部分代码只有在满足一定条件时才进行编译，否则不参与编译(只有参与编译的代码最终才能被执行)，这就是条件编译

- 宏定义与函数的区别
  - 宏定义不涉及存储空间的分配、参数类型匹配、参数传递、返回值问题
  - 函数调用在程序运行时执行，而宏替换只在编译预处理阶段进行。所以带参数的宏比函数具有更高的执行效率
- typedef和#define的区别
  - 宏定义只是简单的字符串替换,￼是在预处理完成的
  - typedef是在编译时处理的,它不是作简单的代换,而是对类型说明符￼重新命名。被命名的标识符具有类型定义说明的功能

```C
#include <stdio.h>

// 源程序中所有的宏名PI在编译预处理的时候都会被3.14所代替
// 宏名一般用大写字母，以便与变量名区别开来
// 定义一个宏时可以引用已经定义的宏名
#define PI 3.14

// 可用宏定义表示数据类型,使书写方便
#define String char*

// 带参数的宏定义
// C语言允许宏带有参数。在宏定义中的参数称为形式参数,在宏调用中的参数称为实际参数。对带参数的宏,在调用中,不仅要宏展开,而且要用实参去代换形参
// 格式: #define 宏名(形参表) 字符串
// 1. 宏名和参数列表之间不能有空格，否则空格后面的所有字符串都作为替换的字符串.
// 2. 带参数的宏在展开时，只作简单的字符和参数的替换，不进行任何计算操作。所以在定义宏时，一般用一个小括号括住字符串的参数
// 3. 计算结果最好也用括号括起来，避免出现一些优先的问题 #define Pow(a) ( (a) * (a) )
#define average(a, b) ((a + b) / 2)


// 条件编译，希望程序的其中一部分代码只有在满足一定条件时才进行编译，否则不参与编译(只有参与编译的代码最终才能被执行)，这就是条件编译
// #if 常量表达式
//      ..code1...
// #else
//      ..code2...
// #endif
// !! 条件编译后面的条件表达式中不能识别变量,它里面只能识别常量和宏定义，同样的，也只能定义常量和宏
#define SCORE 67
#if SCORE > 90
    #define printScore() printf("优秀")
#elif SCORE > 60
    #define printScore() printf("良好")
#else
    #define printScore() printf("不及格")
#endif


// 根据圆的半径计radius算周长
float girth(float radius)
{
    return 2 * PI * radius;
}

int main(void)
{
    float g = girth(2);
    printf("周长为：%f\n", g);

    String str = "123";
    printf("str: %s\n", str);

    printf("avg: %d\n", average(1, 2));

    printScore();

    return 0;
}
```

### malloc

- malloc 和 free 成对使用

```C
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    // 存储在栈中, 内存地址从大到小
    int a = 10;
    int b = 20;
    printf("&a = %p\n", &a); // &a = 0x16b90eb68
    printf("&b = %p\n", &b); // &b = 0x16b90eb64

    // 存储在栈中, 内存地址从小到大
    int* p1 = malloc(sizeof(int));
    *p1 = 10;
    int* p2 = malloc(sizeof(int));
    *p2 = 20;
    printf("p1 = %p\n", p1); //  p1 = 00762F48
    printf("p2 = %p\n", p2); // p2 = 00762F58
    free(p1);
    free(p2);

    // malloc 所在文件:stdlib.h
    // 申请堆内存空间并返回,所申请的空间并未初始化。
    /*
     * malloc
     * 第一个参数: 需要申请多少个字节空间
     * 返回值类型: void *
     */
    int* p = malloc(sizeof(int));
    printf("p = %i\n", *p); // *p可能是垃圾数据
    /*
     * 第一个参数: 需要初始化的内存地址
     * 第二个初始: 需要初始化的值
     * 第三个参数: 需要初始化对少个字节
     */
    memset(p, 0, sizeof(int)); // 对申请的内存空间进行初始化
    printf("p = %i\n", *p); // 初始化为0
    printf("&p = %p\n", p);
    *p = 20;
    printf("p = %i\n", *p);

    // realloc 扩容/缩容
    // 返回的指针，可能与 ptr 的值相同，也有可能不同。
    // 若相同，则说明在原空间后面申请，否则，则可能后续空间不足，重新申请的新的连续空间，原数据拷贝到新空间， 原有空间自动释放
    p = realloc(p, sizeof(int) * 2);
    printf("&p = %p\n", p);
    printf("p = %i\n", *p);

    // free stdlib.h
    // 通过malloc申请的存储空间一定要释放, 所以malloc和free函数总是成对出现
    // 释放申请的堆内存
    free(p);

    return 0;
}
```

### 链表实现

```C
#include <stdio.h>
#include <stdlib.h>

typedef struct node
{
    int data;
    struct node* next;
} Node;

#define NODE_SIZE sizeof(Node)

// 创建一个空链表，包含一个头结点
Node* createNodeList();
// 尾插法
void insertTail(Node* head, int data);
// 头插法
void insertHead(Node* head, int data);
// 打印链表
void printNodeList(Node* node);
// 释放一个链表
void freeNode(Node* head);
// 计算链表长度
int listLength(const Node* head);
// 链表查找
Node* searchList(Node* head, int key);
// 链表删除
void deleteNodeList(Node* head, Node* find);
// 反转链表
void reverseList(Node* head);

int main(void)
{
    Node* head = createNodeList();
    if (!head)
    {
        exit(1);
    }
    insertHead(head, 1);
    insertHead(head, 2);
    insertTail(head, 3);
    insertTail(head, 4);
    printNodeList(head);
    reverseList(head);
    printNodeList(head);
    int length = listLength(head);
    printf("链表长度: %i\n", length);

    if (searchList(head, 4))
    {
        printf("找到了值为%i的节点\n", 4);
    }

    if (searchList(head, 2))
    {
        printf("找到了值为%i的节点\n", 2);
    }

    if (!searchList(head, 100))
    {
        printf("没找到值为%i的节点\n", 100);
    }

    deleteNodeList(head, searchList(head, 4));
    deleteNodeList(head, searchList(head, 2));

    printNodeList(head);

    free(head);
    return 0;
}

Node* createNodeList()
{
    Node* head = malloc(NODE_SIZE);
    if (head == NULL)
    {
        return NULL;
    }
    head->next = NULL;
    return head;
}

void insertTail(Node* head, int data)
{
    // 找到尾结点
    Node* pre = head;
    while (pre != NULL && pre->next != NULL)
    {
        pre = pre->next;
    }
    if (pre == NULL)
    {
        return;
    }
    Node* node = malloc(NODE_SIZE);
    node->data = data;
    node->next = NULL;
    pre->next = node;
}

void insertHead(Node* head, int data)
{
    Node* node = malloc(NODE_SIZE);
    node->data = data;
    node->next = head->next;
    head->next = node;
}

void printNodeList(Node* node)
{
    Node* head = node->next;
    while (head != NULL)
    {
        int currentData = head->data;
        printf("currentData = %i\n", currentData);
        head = head->next;
    }
}

void freeNode(Node* head)
{
    if (head == NULL)
    {
        return;
    }
    Node* cur = NULL;
    while (head != NULL)
    {
        cur = head->next;
        free(head);
        head = cur;
    }
}

// const Node* head 表示指针指向的内容不能修改
// Node* const head 表示这个指针不能修改
int listLength(const Node* head)
{
    if (head == NULL)
    {
        return 0;
    }
    int count = 0;
    head = head->next;
    while (head)
    {
        count++;
        head = head->next;
    }
    return count;
}

Node* searchList(Node* head, int key)
{
    if (!head)
    {
        return NULL;
    }
    head = head->next;
    while (head)
    {
        if (key == head->data)
        {
            break;
        }
        head = head->next;
    }
    return head;
}

void deleteNodeList(Node* head, Node* find)
{
    if (!head)
    {
        return;
    }
    while (head->next != find)
    {
        head = head->next;
    }
    if (head)
    {
        head->next = find->next;
        free(find);
    }
}

void reverseList(Node* head)
{
    Node *pre, *cur;
    pre = head->next;
    // 把head置为一个空链表
    head->next = NULL;
    while (pre)
    {
        // 反转链表，相当于头插法
        cur = pre->next;
        pre->next = head->next;
        head->next = pre;
        pre = cur;
    }
}
```

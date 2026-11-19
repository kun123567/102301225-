/* linked_list_full.c
   Complete singly linked list implementation with many operations.
*/

#include <stdio.h>
#include <stdlib.h>
#include <limits.h>  // for INT_MIN, INT_MAX
#include <stdbool.h>

typedef struct Node {
    int data;
    struct Node* next;
} Node;

/*---------------------- Utility / Basic ----------------------*/

// Create a new node with given data
Node* createNode(int data) {
    Node* newNode = (Node*)malloc(sizeof(Node));
    if (!newNode) {
        fprintf(stderr, "Memory allocation failed\n");
        exit(EXIT_FAILURE);
    }
    newNode->data = data;
    newNode->next = NULL;
    return newNode;
}

// Display list contents
void display(Node* head) {
    printf("List: ");
    Node* cur = head;
    while (cur) {
        printf("%d -> ", cur->data);
        cur = cur->next;
    }
    printf("NULL\n");
}

// Free entire list
void freeList(Node** headRef) {
    Node* cur = *headRef;
    while (cur) {
        Node* tmp = cur;
        cur = cur->next;
        free(tmp);
    }
    *headRef = NULL;
}

/*---------------------- Insertions ----------------------*/

// Insert at beginning
void insertAtBeginning(Node** headRef, int data) {
    Node* newNode = createNode(data);
    newNode->next = *headRef;
    *headRef = newNode;
}

// Insert at end
void insertAtEnd(Node** headRef, int data) {
    Node* newNode = createNode(data);
    if (*headRef == NULL) {
        *headRef = newNode;
        return;
    }
    Node* cur = *headRef;
    while (cur->next) cur = cur->next;
    cur->next = newNode;
}

// Insert at position (1-based). If pos == 1 -> insert at beginning.
// Returns true on success, false if position invalid (> length+1)
bool insertAtPosition(Node** headRef, int pos, int data) {
    if (pos <= 0) return false;
    if (pos == 1) {
        insertAtBeginning(headRef, data);
        return true;
    }
    Node* cur = *headRef;
    int i = 1;
    while (cur && i < pos - 1) {
        cur = cur->next;
        i++;
    }
    if (!cur) return false; // pos is beyond length+1
    Node* newNode = createNode(data);
    newNode->next = cur->next;
    cur->next = newNode;
    return true;
}

// Insert after a given node pointer (nodePtr). Returns true if success.
bool insertAfterNodePtr(Node* nodePtr, int data) {
    if (nodePtr == NULL) return false;
    Node* newNode = createNode(data);
    newNode->next = nodePtr->next;
    nodePtr->next = newNode;
    return true;
}

/*---------------------- Deletions ----------------------*/

// Delete at beginning. Returns true and sets removed value via out if not NULL.
bool deleteAtBeginning(Node** headRef, int *out) {
    if (*headRef == NULL) return false;
    Node* tmp = *headRef;
    *headRef = tmp->next;
    if (out) *out = tmp->data;
    free(tmp);
    return true;
}

// Delete at end. Returns true and sets removed value via out if not NULL.
bool deleteAtEnd(Node** headRef, int *out) {
    if (*headRef == NULL) return false;
    Node* cur = *headRef;
    Node* prev = NULL;
    while (cur->next) {
        prev = cur;
        cur = cur->next;
    }
    if (prev == NULL) { // only one node
        *headRef = NULL;
    } else {
        prev->next = NULL;
    }
    if (out) *out = cur->data;
    free(cur);
    return true;
}

// Delete at position (1-based). Returns true and sets removed value via out if not NULL.
bool deleteAtPosition(Node** headRef, int pos, int *out) {
    if (*headRef == NULL || pos <= 0) return false;
    if (pos == 1) return deleteAtBeginning(headRef, out);
    Node* cur = *headRef;
    Node* prev = NULL;
    int i = 1;
    while (cur && i < pos) {
        prev = cur;
        cur = cur->next;
        i++;
    }
    if (!cur) return false; // position beyond length
    prev->next = cur->next;
    if (out) *out = cur->data;
    free(cur);
    return true;
}

// Delete a node given its pointer (nodePtr). Returns true if success.
// Note: nodePtr must belong to the list starting at headRef. We search for it.
bool deleteNodePtr(Node** headRef, Node* nodePtr, int *out) {
    if (*headRef == NULL || nodePtr == NULL) return false;
    Node* cur = *headRef;
    Node* prev = NULL;
    while (cur && cur != nodePtr) {
        prev = cur;
        cur = cur->next;
    }
    if (!cur) return false; // not found
    if (prev == NULL) { // nodePtr is head
        *headRef = cur->next;
    } else {
        prev->next = cur->next;
    }
    if (out) *out = cur->data;
    free(cur);
    return true;
}

/*---------------------- Search / Traverse ----------------------*/

// Search for first node with value 'key'. Returns pointer or NULL if not found.
Node* search(Node* head, int key) {
    Node* cur = head;
    while (cur) {
        if (cur->data == key) return cur;
        cur = cur->next;
    }
    return NULL;
}

// Traverse (same as display) but optionally apply a function to each node.
// If func is NULL, it just prints nodes.
void traverse(Node* head, void (*func)(Node*)) {
    Node* cur = head;
    while (cur) {
        if (func) func(cur);
        else printf("%d -> ", cur->data);
        cur = cur->next;
    }
    if (!func) printf("NULL\n");
}

/*---------------------- Find Min / Max ----------------------*/

// Find maximum value in list. Returns true if found and sets *out.
bool findMax(Node* head, int *out) {
    if (!head) return false;
    int mx = INT_MIN;
    Node* cur = head;
    while (cur) {
        if (cur->data > mx) mx = cur->data;
        cur = cur->next;
    }
    *out = mx;
    return true;
}

// Find minimum value in list. Returns true if found and sets *out.
bool findMin(Node* head, int *out) {
    if (!head) return false;
    int mn = INT_MAX;
    Node* cur = head;
    while (cur) {
        if (cur->data < mn) mn = cur->data;
        cur = cur->next;
    }
    *out = mn;
    return true;
}

/*---------------------- Reverse ----------------------*/

// Reverse the list in-place. Returns new head.
Node* reverseList(Node* head) {
    Node* prev = NULL;
    Node* cur = head;
    Node* next = NULL;
    while (cur) {
        next = cur->next;
        cur->next = prev;
        prev = cur;
        cur = next;
    }
    return prev;
}

/*---------------------- Example main demonstrating all ops ----------------------*/

int main(void) {
    Node* head = NULL;
    int value;

    printf("== Insert at end: 10, 20, 30 ==\n");
    insertAtEnd(&head, 10);
    insertAtEnd(&head, 20);
    insertAtEnd(&head, 30);
    display(head);

    printf("\n== Insert at beginning: 5 ==\n");
    insertAtBeginning(&head, 5);
    display(head);

    printf("\n== Insert at position 3 (1-based): insert 15 at pos 3 ==\n");
    if (insertAtPosition(&head, 3, 15))
        display(head);
    else
        printf("Insert at position failed\n");

    printf("\n== Search for 20 ==\n");
    Node* found = search(head, 20);
    if (found) printf("Found node with data = %d\n", found->data);
    else printf("20 not found\n");

    printf("\n== Insert after node pointer (after 20): insert 25 ==\n");
    if (found && insertAfterNodePtr(found, 25)) display(head);
    else printf("Insert after node pointer failed\n");

    printf("\n== Delete at beginning ==\n");
    if (deleteAtBeginning(&head, &value)) {
        printf("Deleted %d from beginning\n", value);
        display(head);
    }

    printf("\n== Delete at end ==\n");
    if (deleteAtEnd(&head, &value)) {
        printf("Deleted %d from end\n", value);
        display(head);
    }

    printf("\n== Delete at position 3 ==\n");
    if (deleteAtPosition(&head, 3, &value)) {
        printf("Deleted %d at position 3\n", value);
        display(head);
    } else {
        printf("Delete at position failed\n");
    }

    printf("\n== Delete node pointer (delete node with value 15 if exists) ==\n");
    Node* node15 = search(head, 15);
    if (node15) {
        if (deleteNodePtr(&head, node15, &value)) {
            printf("Deleted node pointer with value %d\n", value);
            display(head);
        }
    } else {
        printf("Node 15 not present\n");
    }

    printf("\n== Find max and min ==\n");
    int mx, mn;
    if (findMax(head, &mx)) printf("Max = %d\n", mx);
    else printf("List empty, no max\n");
    if (findMin(head, &mn)) printf("Min = %d\n", mn);
    else printf("List empty, no min\n");

    printf("\n== Reverse list ==\n");
    head = reverseList(head);
    display(head);

    printf("\n== Final traversal (using traverse with no func) ==\n");
    traverse(head, NULL);
    printf("NULL\n");

    freeList(&head);
    return 0;
}



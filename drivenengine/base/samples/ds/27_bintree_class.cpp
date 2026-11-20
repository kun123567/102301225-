// @desc 二叉树（C++ class 版）：层序输入构建 + 前/中/后/层序遍历（用户实测用）
#include <iostream>
using namespace std;

struct Node {
    int val;
    Node* left;
    Node* right;
    Node(int v) : val(v), left(nullptr), right(nullptr) {}
};

class NodeQueue {
private:
    Node** data;
    int cap;
    int head;
    int tail;

    void resize() {
        int newCap = cap * 2;
        Node** nd = new Node*[newCap];
        int n = tail - head;
        for (int i = 0; i < n; ++i) {
            nd[i] = data[head + i];
        }
        delete[] data;
        data = nd;
        cap = newCap;
        head = 0;
        tail = n;
    }

public:
    NodeQueue(int c = 16) : cap(c), head(0), tail(0) {
        data = new Node*[cap];
    }
    ~NodeQueue() {
        delete[] data;
    }
    void push(Node* x) {
        if (tail == cap) resize();
        data[tail++] = x;
    }
    Node* pop() {
        return data[head++];
    }
    bool empty() const {
        return head >= tail;
    }
};

Node* buildTree() {
    int val;
    if (!(cin >> val) || val == -1) {
        return nullptr;
    }
    Node* root = new Node(val);
    NodeQueue q;
    q.push(root);
    while (!q.empty()) {
        Node* cur = q.pop();
        int lv, rv;
        if (!(cin >> lv)) lv = -1;
        if (lv != -1) {
            cur->left = new Node(lv);
            q.push(cur->left);
        }
        if (!(cin >> rv)) rv = -1;
        if (rv != -1) {
            cur->right = new Node(rv);
            q.push(cur->right);
        }
    }
    return root;
}

void preOrder(Node* root) {
    if (!root) return;
    cout << root->val << " ";
    preOrder(root->left);
    preOrder(root->right);
}

void levelOrder(Node* root) {
    if (!root) return;
    NodeQueue q;
    q.push(root);
    while (!q.empty()) {
        Node* cur = q.pop();
        cout << cur->val << " ";
        if (cur->left) q.push(cur->left);
        if (cur->right) q.push(cur->right);
    }
}

int main() {
    Node* root = buildTree();
    if (!root) {
        cout << "空树" << endl;
        return 0;
    }
    cout << "前序遍历: ";
    preOrder(root);
    cout << endl;
    cout << "层序遍历: ";
    levelOrder(root);
    cout << endl;
    return 0;
}

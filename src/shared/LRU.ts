export type LruId = string | number;

class Node<V extends { id: LruId }> {
  prev?: Node<V>;
  next?: Node<V>;
  value: V;

  constructor(value: V) {
    this.value = value;
  }
}

export class LRU<V extends { id: LruId }> {
  private head?: Node<V>;
  private tail?: Node<V>;
  private lookup = new Map<LruId, Node<V>>();
  private length = 0;

  public get size(): number {
    return this.length;
  }

  public has(key: LruId): boolean {
    return this.lookup.has(key);
  }

  public get(key: LruId): V | undefined {
    const node = this.lookup.get(key);

    if (!node) return undefined;

    this.detach(node);
    this.prepend(node);

    return node.value;
  }

  private detach(node: Node<V>): void {
    this.lookup.delete(node.value.id);
    this.length--;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = undefined;
    node.next = undefined;
  }

  private prepend(node: Node<V>): void {
    this.lookup.set(node.value.id, node);
    this.length++;

    node.prev = undefined;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    } else {
      this.tail = node;
    }

    this.head = node;
  }

  public add(value: V): void {
    const existing = this.lookup.get(value.id);

    if (existing) {
      existing.value = value;
      this.detach(existing);
      this.prepend(existing);
      return;
    }

    this.prepend(new Node(value));
  }

  public delete(key: LruId): boolean {
    const node = this.lookup.get(key);

    if (!node) return false;

    this.detach(node);
    return true;
  }

  public toArray(): V[] {
    const out: V[] = [];
    let node = this.head;

    while (node) {
      out.push(node.value);
      node = node.next;
    }

    return out;
  }

  public *[Symbol.iterator](): IterableIterator<V> {
    for (let node = this.head; node; node = node.next) {
      yield node.value;
    }
  }
}

import { SpaceColonization } from './SpaceColonization.js';
import { TREE_CONFIG } from '../config.js';

/**
 * Wrapper around SpaceColonization that provides convenient access
 * to the node graph: branch segments, terminal nodes, fork nodes, etc.
 */
export class TreeSkeleton {
  constructor(config = TREE_CONFIG) {
    this.config = config;
    this.nodes = [];
    this._children = [];
    this._segments = null;
  }

  generate() {
    const sc = new SpaceColonization(this.config);
    this.nodes = sc.generate();

    // Build children lookup
    this._children = new Array(this.nodes.length);
    for (let i = 0; i < this.nodes.length; i++) this._children[i] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].parentIndex >= 0) {
        this._children[this.nodes[i].parentIndex].push(i);
      }
    }

    this._segments = null;
    return this;
  }

  getNodes() {
    return this.nodes;
  }

  /**
   * Get unique branch segments — runs of nodes between fork/terminal points.
   * Each segment starts at the root or a fork node, and ends at the next
   * fork node or terminal. Fork nodes are INCLUDED at both ends so child
   * segments share the parent's last ring for geometric continuity.
   */
  getBranchSegments() {
    if (this._segments) return this._segments;

    const segments = [];
    // DFS from root, accumulating segments between forks/terminals
    const stack = [{ nodeIdx: 0, segment: [] }];

    while (stack.length > 0) {
      const { nodeIdx, segment } = stack.pop();
      segment.push(nodeIdx);

      const children = this._children[nodeIdx];

      if (children.length === 0) {
        // Terminal node — finish this segment
        if (segment.length >= 2) {
          segments.push(segment);
        }
      } else if (children.length === 1) {
        // Continuation — keep building the segment
        stack.push({ nodeIdx: children[0], segment });
      } else {
        // Fork — finish this segment (including the fork node),
        // then start new child segments that ALSO include the fork node
        // so tube geometry connects seamlessly at the junction.
        if (segment.length >= 2) {
          segments.push(segment);
        }
        for (const child of children) {
          stack.push({ nodeIdx: child, segment: [nodeIdx] });
        }
      }
    }

    this._segments = segments;
    return segments;
  }

  getTerminalNodes() {
    const terminals = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this._children[i].length === 0) {
        terminals.push(i);
      }
    }
    return terminals;
  }

  getForkNodes() {
    const forks = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this._children[i].length > 1) {
        forks.push(i);
      }
    }
    return forks;
  }

  getNodesByDepthRange(min, max) {
    return this.nodes
      .map((n, i) => ({ ...n, index: i }))
      .filter(n => n.depth >= min && n.depth <= max);
  }

  getMaxDepth() {
    let max = 0;
    for (const n of this.nodes) {
      if (n.depth > max) max = n.depth;
    }
    return max;
  }

  getChildren(nodeIndex) {
    return this._children[nodeIndex] || [];
  }
}

declare module "d3-force-3d" {
  export type SimNode = {
    id: string;
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  };
  export type SimLink<N> = { source: string | N; target: string | N };

  type Accessor<T, R> = R | ((d: T, i: number) => R);

  export interface Force<N> {
    (alpha: number): void;
  }

  export interface Simulation<N extends SimNode> {
    force(name: string, force: Force<N> | null): this;
    tick(iterations?: number): this;
    alpha(): number;
    alpha(a: number): this;
    stop(): this;
    nodes(): N[];
  }

  export interface LinkForce<N, L> extends Force<N> {
    id(fn: (d: N) => string): this;
    distance(d: Accessor<L, number>): this;
    strength(s: Accessor<L, number>): this;
    iterations(n: number): this;
  }
  export interface ManyBody<N> extends Force<N> {
    strength(s: Accessor<N, number>): this;
    distanceMax(d: number): this;
  }
  export interface Positioning<N> extends Force<N> {
    strength(s: Accessor<N, number>): this;
  }

  export function forceSimulation<N extends SimNode>(nodes: N[], numDimensions?: 1 | 2 | 3): Simulation<N>;
  export function forceLink<N extends SimNode, L extends SimLink<N>>(links: L[]): LinkForce<N, L>;
  export function forceManyBody<N extends SimNode>(): ManyBody<N>;
  export function forceCenter<N extends SimNode>(x?: number, y?: number, z?: number): Force<N>;
  export function forceX<N extends SimNode>(x: Accessor<N, number>): Positioning<N>;
  export function forceY<N extends SimNode>(y: Accessor<N, number>): Positioning<N>;
  export function forceZ<N extends SimNode>(z: Accessor<N, number>): Positioning<N>;
}

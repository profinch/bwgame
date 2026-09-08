/** What a walker has to go round, or climb onto. */
export interface Obstacle {
  x: number;
  z: number;
  halfWide: number;
  halfDeep: number;
  turn: number;
  /** Where its roof is, so anything low enough can be stood on. */
  top: number;
}

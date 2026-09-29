import { PHYSICS_CONSTANTS } from './config.js';

export class PhysicsPredictor {
  constructor(stadium) {
    this.stadium = stadium;
    this.updateStadiumProperties();
  }

  updateStadiumProperties() {
    if (!this.stadium) return;

    this.width = this.stadium.width || 0;
    this.height = this.stadium.height || 0;
    this.walls = this.stadium.segments || [];
    this.goals = this.stadium.goals || [];
  }

  /**
   * Predicts ball position after N ticks
   * @param {Object} ballState - Current ball state {x, y, xspeed, yspeed, radius, damping, invMass}
   * @param {number} ticks - Number of ticks to predict
   * @returns {Array} Array of predicted positions [{x, y, tick}]
   */
  predictBallTrajectory(ballState, ticks) {
    if (!ballState || ballState.x === undefined || ballState.x === null) return [];

    const trajectory = [];
    let state = { ...ballState };

    for (let i = 0; i < ticks; i++) {
      state = this.simulateTick(state);
      trajectory.push({
        x: state.x,
        y: state.y,
        xspeed: state.xspeed,
        yspeed: state.yspeed,
        tick: i + 1
      });
    }

    return trajectory;
  }

  /**
   * Simulates one physics tick
   */
  simulateTick(state) {
    let { x, y, xspeed, yspeed, radius, damping, invMass } = state;

    // Apply velocity
    x += xspeed;
    y += yspeed;

    // Apply damping
    const dampingFactor = damping || PHYSICS_CONSTANTS.DEFAULT_DAMPING;
    xspeed *= dampingFactor;
    yspeed *= dampingFactor;

    // Check wall collisions
    const r = radius || PHYSICS_CONSTANTS.DEFAULT_BALL_RADIUS;

    // Top and bottom walls
    if (y - r < -this.height / 2) {
      y = -this.height / 2 + r;
      yspeed = Math.abs(yspeed) * 0.8; // Bounce with energy loss
    } else if (y + r > this.height / 2) {
      y = this.height / 2 - r;
      yspeed = -Math.abs(yspeed) * 0.8;
    }

    // Left and right walls
    if (x - r < -this.width / 2) {
      x = -this.width / 2 + r;
      xspeed = Math.abs(xspeed) * 0.8;
    } else if (x + r > this.width / 2) {
      x = this.width / 2 - r;
      xspeed = -Math.abs(xspeed) * 0.8;
    }

    return { ...state, x, y, xspeed, yspeed };
  }

  /**
   * Calculates the earliest interception point
   * @param {Object} ballState - Current ball state
   * @param {Object} playerState - Current player state {x, y, maxSpeed}
   * @param {number} maxTicks - Maximum ticks to check
   * @returns {Object|null} {x, y, tick, distance} or null if no interception
   */
  calculateInterception(ballState, playerState, maxTicks = 60) {
    const trajectory = this.predictBallTrajectory(ballState, maxTicks);
    const playerSpeed = playerState.maxSpeed || 1.0;
    const maxDistPerTick = 1.0 * playerSpeed; // Approximate max movement per tick

    for (let i = 0; i < trajectory.length; i++) {
      const ballPos = trajectory[i];
      const dx = ballPos.x - playerState.x;
      const dy = ballPos.y - playerState.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const requiredTicks = distance / maxDistPerTick;

      if (requiredTicks <= ballPos.tick) {
        return {
          x: ballPos.x,
          y: ballPos.y,
          tick: ballPos.tick,
          distance
        };
      }
    }

    return null;
  }

  /**
   * Checks if a shot from given position will score
   * @param {Object} position - {x, y}
   * @param {Object} targetGoal - Goal object
   * @param {Object} goalkeeper - Goalkeeper position {x, y} or null
   * @returns {Object} {canScore, bestAngle, probability}
   */
  evaluateShot(position, targetGoal, goalkeeper = null) {
    if (!targetGoal) return { canScore: false, bestAngle: 0, probability: 0 };

    const goalCenter = {
      x: (targetGoal.p0.x + targetGoal.p1.x) / 2,
      y: (targetGoal.p0.y + targetGoal.p1.y) / 2
    };

    const dx = goalCenter.x - position.x;
    const dy = goalCenter.y - position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    let probability = Math.max(0, 1 - distance / 400); // Base probability on distance

    if (goalkeeper) {
      const gkDx = goalkeeper.x - goalCenter.x;
      const gkDy = goalkeeper.y - goalCenter.y;
      const gkDistance = Math.sqrt(gkDx * gkDx + gkDy * gkDy);
      
      // Reduce probability if goalkeeper is near goal
      probability *= Math.max(0.2, gkDistance / 50);
    }

    return {
      canScore: probability > 0.3,
      bestAngle: angle,
      probability
    };
  }

  /**
   * Calculates optimal defensive position
   * @param {Object} ballPos - Ball position {x, y}
   * @param {Object} ownGoal - Own goal object
   * @returns {Object} {x, y}
   */
  calculateDefensivePosition(ballPos, ownGoal) {
    if (!ownGoal) return ballPos;

    const goalCenter = {
      x: (ownGoal.p0.x + ownGoal.p1.x) / 2,
      y: (ownGoal.p0.y + ownGoal.p1.y) / 2
    };

    // Position between ball and goal, weighted toward goal
    const weight = 0.7;
    return {
      x: goalCenter.x * weight + ballPos.x * (1 - weight),
      y: goalCenter.y * weight + ballPos.y * (1 - weight)
    };
  }

  /**
   * Finds best pass target among teammates
   * @param {Object} ballPos - Ball position
   * @param {Array} teammates - Array of teammate positions
   * @param {Array} opponents - Array of opponent positions
   * @returns {Object|null} Best teammate to pass to
   */
  findBestPassTarget(ballPos, teammates, opponents) {
    if (!teammates || teammates.length === 0) return null;

    let bestTeammate = null;
    let bestScore = -Infinity;

    for (const teammate of teammates) {
      const dx = teammate.x - ballPos.x;
      const dy = teammate.y - ballPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 30) continue; // Too close for a pass

      // Score based on distance and opponent proximity
      let score = 100 - distance;

      // Penalize if opponents are nearby
      for (const opponent of opponents) {
        const oppDx = opponent.x - teammate.x;
        const oppDy = opponent.y - teammate.y;
        const oppDist = Math.sqrt(oppDx * oppDx + oppDy * oppDy);
        score -= Math.max(0, 50 - oppDist);
      }

      if (score > bestScore) {
        bestScore = score;
        bestTeammate = teammate;
      }
    }

    return bestTeammate;
  }
}

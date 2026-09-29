import { GAME_STATES } from './config.js';

export class BotAI {
  constructor(config, physics) {
    this.config = config;
    this.physics = physics;
    this.currentState = GAME_STATES.IDLE;
    this.lastDecisionTime = 0;
  }

  /**
   * Main decision function - called every tick
   * @param {Object} gameState - Current game state
   * @param {Object} botPlayer - Bot player object
   * @returns {Object} {dirX, dirY, kick}
   */
  decide(gameState, botPlayer) {
    if (!gameState || !botPlayer || !botPlayer.disc) {
      return { dirX: 0, dirY: 0, kick: false };
    }

    const now = Date.now();
    if (now - this.lastDecisionTime < this.config.ai.reactionTime) {
      return this.lastDecision || { dirX: 0, dirY: 0, kick: false };
    }
    this.lastDecisionTime = now;

    const context = this.analyzeGameState(gameState, botPlayer);
    const decision = this.makeDecision(context);

    this.lastDecision = decision;
    return decision;
  }

  /**
   * Analyzes current game state
   */
  analyzeGameState(gameState, botPlayer) {
    const ball = gameState.physicsState?.discs?.[0];
    if (!ball) return null;

    const playerDisc = botPlayer.disc.ext;
    const teamId = botPlayer.team.id;
    const opponentTeamId = 3 - teamId;

    const teammates = this.getTeammates(gameState, botPlayer);
    const opponents = this.getOpponents(gameState, botPlayer);

    const ownGoal = this.getGoalByTeam(gameState, teamId);
    const targetGoal = this.getGoalByTeam(gameState, opponentTeamId);

    const ballState = {
      x: ball.pos.x,
      y: ball.pos.y,
      xspeed: ball.xspeed || 0,
      yspeed: ball.yspeed || 0,
      radius: ball.radius,
      damping: ball.damping,
      invMass: ball.invMass
    };

    const distanceToBall = this.getDistance(
      playerDisc.pos,
      { x: ballState.x, y: ballState.y }
    );

    return {
      ball: ballState,
      player: {
        x: playerDisc.pos.x,
        y: playerDisc.pos.y,
        radius: playerDisc.radius,
        maxSpeed: this.config.ai.maxSpeed
      },
      teammates,
      opponents,
      ownGoal,
      targetGoal,
      distanceToBall,
      teamId,
      opponentTeamId,
      scores: gameState.scores
    };
  }

  /**
   * Makes decision based on context
   */
  makeDecision(context) {
    if (!context) return { dirX: 0, dirY: 0, kick: false };

    // Determine game state
    this.currentState = this.determineGameState(context);

    switch (this.currentState) {
      case GAME_STATES.KICKOFF:
        return this.handleKickoff(context);
      
      case GAME_STATES.INTERCEPT:
        return this.handleIntercept(context);
      
      case GAME_STATES.ATTACK:
        return this.handleAttack(context);
      
      case GAME_STATES.PASS:
        return this.handlePass(context);
      
      case GAME_STATES.SHOOT:
        return this.handleShoot(context);
      
      case GAME_STATES.DEFEND:
        return this.handleDefend(context);
      
      case GAME_STATES.POSITION:
      default:
        return this.handlePosition(context);
    }
  }

  /**
   * Determines current game state
   */
  determineGameState(context) {
    const { ball, player, distanceToBall, ownGoal, targetGoal } = context;

    // Check if ball is very close - intercept or attack
    if (distanceToBall < 30) {
      const distToOwnGoal = this.getDistance(
        { x: ball.x, y: ball.y },
        { x: (ownGoal.p0.x + ownGoal.p1.x) / 2, y: (ownGoal.p0.y + ownGoal.p1.y) / 2 }
      );
      
      const distToTargetGoal = this.getDistance(
        { x: ball.x, y: ball.y },
        { x: (targetGoal.p0.x + targetGoal.p1.x) / 2, y: (targetGoal.p0.y + targetGoal.p1.y) / 2 }
      );

      // If near opponent's goal, shoot
      if (distToTargetGoal < 150) {
        return GAME_STATES.SHOOT;
      }

      // If we have teammates and they're in better position, pass
      if (context.teammates.length > 0 && Math.random() < 0.3) {
        return GAME_STATES.PASS;
      }

      return GAME_STATES.ATTACK;
    }

    // If ball is coming toward our goal, defend
    const goalCenter = {
      x: (ownGoal.p0.x + ownGoal.p1.x) / 2,
      y: (ownGoal.p0.y + ownGoal.p1.y) / 2
    };

    const ballToGoalDist = this.getDistance(
      { x: ball.x, y: ball.y },
      goalCenter
    );

    if (ballToGoalDist < 200) {
      return GAME_STATES.DEFEND;
    }

    // Try to intercept if ball is reachable
    const interception = this.physics.calculateInterception(
      context.ball,
      context.player,
      this.config.ai.predictionTicks
    );

    if (interception && interception.tick < 30) {
      return GAME_STATES.INTERCEPT;
    }

    return GAME_STATES.POSITION;
  }

  handleKickoff(context) {
    return this.moveToward(context.player, context.ball, true);
  }

  handleIntercept(context) {
    const interception = this.physics.calculateInterception(
      context.ball,
      context.player,
      this.config.ai.predictionTicks
    );

    if (interception) {
      return this.moveToward(
        context.player,
        { x: interception.x, y: interception.y },
        interception.tick < 5
      );
    }

    return this.moveToward(context.player, context.ball, false);
  }

  handleAttack(context) {
    const targetGoalCenter = {
      x: (context.targetGoal.p0.x + context.targetGoal.p1.x) / 2,
      y: (context.targetGoal.p0.y + context.targetGoal.p1.y) / 2
    };

    // Dribble toward goal
    const dribbleTarget = {
      x: context.ball.x + (targetGoalCenter.x - context.ball.x) * 0.3,
      y: context.ball.y + (targetGoalCenter.y - context.ball.y) * 0.3
    };

    const shouldKick = context.distanceToBall < 20;
    return this.moveToward(context.player, dribbleTarget, shouldKick);
  }

  handlePass(context) {
    const passTarget = this.physics.findBestPassTarget(
      context.ball,
      context.teammates,
      context.opponents
    );

    if (passTarget) {
      const shouldKick = context.distanceToBall < 20;
      return this.moveToward(context.player, passTarget, shouldKick);
    }

    return this.handleAttack(context);
  }

  handleShoot(context) {
    const shot = this.physics.evaluateShot(
      context.player,
      context.targetGoal,
      this.findGoalkeeper(context.opponents, context.targetGoal)
    );

    if (shot.canScore) {
      const targetX = (context.targetGoal.p0.x + context.targetGoal.p1.x) / 2;
      const targetY = (context.targetGoal.p0.y + context.targetGoal.p1.y) / 2;
      
      const shouldKick = context.distanceToBall < 25;
      return this.moveToward(
        context.player,
        { x: targetX, y: targetY },
        shouldKick
      );
    }

    return this.handleAttack(context);
  }

  handleDefend(context) {
    const defensivePos = this.physics.calculateDefensivePosition(
      context.ball,
      context.ownGoal
    );

    const shouldKick = context.distanceToBall < 30;
    return this.moveToward(context.player, defensivePos, shouldKick);
  }

  handlePosition(context) {
    // Move toward ball
    return this.moveToward(context.player, context.ball, false);
  }

  /**
   * Calculates movement direction toward target
   */
  moveToward(player, target, kick) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;

    const threshold = 2;
    const dirX = Math.abs(dx) < threshold ? 0 : Math.sign(dx);
    const dirY = Math.abs(dy) < threshold ? 0 : Math.sign(dy);

    return { dirX, dirY, kick };
  }

  /**
   * Helper methods
   */
  getTeammates(gameState, botPlayer) {
    const teammates = [];
    const playerList = gameState.players || [];

    for (const player of playerList) {
      if (player.id !== botPlayer.id && player.team.id === botPlayer.team.id && player.disc) {
        teammates.push({
          id: player.id,
          x: player.disc.ext.pos.x,
          y: player.disc.ext.pos.y
        });
      }
    }

    return teammates;
  }

  getOpponents(gameState, botPlayer) {
    const opponents = [];
    const playerList = gameState.players || [];

    for (const player of playerList) {
      if (player.team.id !== botPlayer.team.id && player.disc) {
        opponents.push({
          id: player.id,
          x: player.disc.ext.pos.x,
          y: player.disc.ext.pos.y
        });
      }
    }

    return opponents;
  }

  getGoalByTeam(gameState, teamId) {
    const goals = gameState.stadium?.goals || [];
    return goals.find(g => g.team.id === teamId) || null;
  }

  findGoalkeeper(opponents, goal) {
    if (!opponents || opponents.length === 0 || !goal) return null;

    const goalCenter = {
      x: (goal.p0.x + goal.p1.x) / 2,
      y: (goal.p0.y + goal.p1.y) / 2
    };

    let nearest = null;
    let minDist = Infinity;

    for (const opp of opponents) {
      const dist = this.getDistance(opp, goalCenter);
      if (dist < minDist) {
        minDist = dist;
        nearest = opp;
      }
    }

    return nearest;
  }

  getDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

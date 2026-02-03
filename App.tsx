import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

type ItemType = 'obstacle' | 'coin';

type Item = {
  id: number;
  type: ItemType;
  lane: number;
  y: number;
};

const LANES = 3;
const BASE_SPEED = 360;
const SPEED_RAMP = 10;
const SPAWN_MIN = 360;
const SPAWN_MAX = 900;
const COIN_CHANCE = 0.25;

const CAR_WIDTH = 34;
const CAR_HEIGHT = 52;
const ITEM_WIDTH = 30;
const ITEM_HEIGHT = 44;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function App() {
  const { width, height } = useWindowDimensions();
  const roadWidth = Math.min(360, width * 0.82);
  const laneWidth = roadWidth / LANES;
  const roadLeft = (width - roadWidth) / 2;
  const carY = height - 140;

  const [gameState, setGameState] = useState<'ready' | 'running' | 'gameover'>(
    'ready'
  );
  const [laneIndex, setLaneIndex] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [speed, setSpeed] = useState(BASE_SPEED);

  const itemsRef = useRef<Item[]>([]);
  const laneRef = useRef(laneIndex);
  const scoreRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);
  const elapsedRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);
  const nextIdRef = useRef(1);
  const rafRef = useRef<number | null>(null);

  const updateLane = useCallback((updater: (current: number) => number) => {
    setLaneIndex((current) => {
      const next = updater(current);
      laneRef.current = next;
      return next;
    });
  }, []);

  const moveLeft = useCallback(() => {
    updateLane((current) => clamp(current - 1, 0, LANES - 1));
  }, [updateLane]);

  const moveRight = useCallback(() => {
    updateLane((current) => clamp(current + 1, 0, LANES - 1));
  }, [updateLane]);

  const startGame = useCallback(() => {
    setGameState('running');
    laneRef.current = 1;
    setLaneIndex(1);
    setItems([]);
    itemsRef.current = [];
    setScore(0);
    scoreRef.current = 0;
    setSpeed(BASE_SPEED);
    speedRef.current = BASE_SPEED;
    elapsedRef.current = 0;
    lastSpawnRef.current = 0;
    lastTimeRef.current = 0;
  }, []);

  const endGame = useCallback(() => {
    setGameState('gameover');
    setHighScore((prev) => Math.max(prev, scoreRef.current));
  }, []);

  const trySpawnItem = useCallback(
    (timeMs: number) => {
      const elapsed = elapsedRef.current;
      const interval = Math.max(
        SPAWN_MIN,
        SPAWN_MAX - Math.floor(elapsed * 10)
      );
      if (timeMs - lastSpawnRef.current < interval) {
        return;
      }
      const lane = Math.floor(Math.random() * LANES);
      const lastInLane = itemsRef.current
        .filter((item) => item.lane === lane)
        .sort((a, b) => a.y - b.y)[0];
      if (lastInLane && lastInLane.y < ITEM_HEIGHT * 1.6) {
        return;
      }
      lastSpawnRef.current = timeMs;
      const type: ItemType = Math.random() < COIN_CHANCE ? 'coin' : 'obstacle';
      const item: Item = {
        id: nextIdRef.current++,
        type,
        lane,
        y: -ITEM_HEIGHT,
      };
      itemsRef.current = [...itemsRef.current, item];
      setItems(itemsRef.current);
    },
    []
  );

  const tick = useCallback(
    (timeMs: number) => {
      if (gameState !== 'running') {
        return;
      }
      if (!lastTimeRef.current) {
        lastTimeRef.current = timeMs;
      }
      const deltaMs = timeMs - lastTimeRef.current;
      const delta = deltaMs / 1000;
      lastTimeRef.current = timeMs;
      elapsedRef.current += delta;
      const nextSpeed = speedRef.current + SPEED_RAMP * delta;
      speedRef.current = nextSpeed;
      setSpeed(Math.round(nextSpeed));
      const distance = nextSpeed * delta;

      const carTop = carY - CAR_HEIGHT / 2;
      const carBottom = carY + CAR_HEIGHT / 2;
      let hitObstacle = false;
      let scoreDelta = 0;
      const updatedItems: Item[] = [];

      for (const item of itemsRef.current) {
        const nextY = item.y + distance;
        if (nextY > height + ITEM_HEIGHT) {
          continue;
        }
        const itemTop = nextY;
        const itemBottom = nextY + ITEM_HEIGHT;
        const sameLane = item.lane === laneRef.current;
        const overlaps = itemBottom > carTop && itemTop < carBottom;

        if (sameLane && overlaps) {
          if (item.type === 'obstacle') {
            hitObstacle = true;
            continue;
          }
          scoreDelta += 120;
          continue;
        }

        updatedItems.push({ ...item, y: nextY });
      }

      itemsRef.current = updatedItems;
      setItems(updatedItems);

      if (scoreDelta) {
        scoreRef.current += scoreDelta;
      }
      scoreRef.current += Math.floor(delta * 30);
      setScore(scoreRef.current);

      trySpawnItem(timeMs);

      if (hitObstacle) {
        endGame();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [carY, endGame, gameState, height, trySpawnItem]
  );

  useEffect(() => {
    if (gameState !== 'running') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [gameState, tick]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 30,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 40) {
            moveRight();
          } else if (gesture.dx < -40) {
            moveLeft();
          }
        },
      }),
    [moveLeft, moveRight]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container} {...panResponder.panHandlers}>
        <View style={styles.hud}>
          <Text style={styles.hudText}>Score {score}</Text>
          <Text style={styles.hudText}>High {highScore}</Text>
          <Text style={styles.hudText}>Speed {speed}</Text>
        </View>

        <View style={[styles.road, { width: roadWidth }]}>
          {Array.from({ length: LANES - 1 }).map((_, index) => (
            <View
              key={`lane-${index}`}
              style={[
                styles.laneLine,
                { left: laneWidth * (index + 1) - 2 },
              ]}
            />
          ))}
        </View>

        {items.map((item) => {
          const left =
            roadLeft + item.lane * laneWidth + (laneWidth - ITEM_WIDTH) / 2;
          return (
            <View
              key={item.id}
              style={[
                styles.item,
                {
                  left,
                  top: item.y,
                  backgroundColor:
                    item.type === 'coin' ? '#f7c948' : '#f25f5c',
                },
              ]}
            />
          );
        })}

        <View
          style={[
            styles.car,
            {
              left: roadLeft + laneIndex * laneWidth + (laneWidth - CAR_WIDTH) / 2,
              top: carY - CAR_HEIGHT / 2,
            },
          ]}
        />

        {gameState !== 'running' && (
          <View style={styles.overlay}>
            <Text style={styles.title}>Lane Drift</Text>
            <Text style={styles.subtitle}>
              Swipe left or right to change lanes.
            </Text>
            <TouchableOpacity onPress={startGame} style={styles.cta}>
              <Text style={styles.ctaText}>
                {gameState === 'ready' ? 'Start Run' : 'Try Again'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b0f1a',
  },
  container: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  road: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#1d2333',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2e3548',
  },
  laneLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  item: {
    position: 'absolute',
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    borderRadius: 6,
  },
  car: {
    position: 'absolute',
    width: CAR_WIDTH,
    height: CAR_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#4d77ff',
    borderWidth: 2,
    borderColor: '#b8c6ff',
  },
  hud: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  hudText: {
    color: '#f3f7ff',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,16,0.65)',
    paddingHorizontal: 28,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: '#c6d0f5',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  cta: {
    backgroundColor: '#f7c948',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  ctaText: {
    color: '#1b1b1b',
    fontSize: 16,
    fontWeight: '700',
  },
});

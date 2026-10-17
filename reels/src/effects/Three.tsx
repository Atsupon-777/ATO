// Real 3D scenes (three.js through @remotion/three): a lit glossy object that turns in the light, and a
// particle galaxy the camera flies into. Both read every value from the frame, so renders are repeatable.
// Rendering needs WebGL in the headless browser: renders pass chromiumOptions.gl = 'angle'.
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { fonts } from '../lib/fonts';
import { clamp, easeOutExpo, pop, progress } from '../lib/timing';
import { Caption, FONT_FAMILY, Footage, Subject, rand, useSource, type EffectProps } from './layers';

const W = 1080;
const H = 1920;

/** Shapes the object scene cycles through, picked from the beat's text so the same line keeps its shape. */
const SHAPES = ['knot', 'torus', 'ico', 'box'] as const;

const Shape: React.FC<{ kind: (typeof SHAPES)[number]; color: string }> = ({ kind, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = pop(frame, fps, 0, 13);
  const geometry = useMemo(() => {
    if (kind === 'knot') return new THREE.TorusKnotGeometry(1, 0.34, 220, 32);
    if (kind === 'torus') return new THREE.TorusGeometry(1.15, 0.42, 48, 160);
    if (kind === 'ico') return new THREE.IcosahedronGeometry(1.4, 1);
    return new THREE.BoxGeometry(1.8, 1.8, 1.8, 1, 1, 1);
  }, [kind]);
  return (
    <group rotation={[0.35 + frame * 0.012, frame * 0.028 + (1 - grow) * 2.4, 0]} scale={grow}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.55}
          roughness={kind === 'ico' ? 0.35 : 0.16}
          clearcoat={1}
          clearcoatRoughness={0.08}
          flatShading={kind === 'ico'}
        />
      </mesh>
      {kind === 'box' || kind === 'ico' ? (
        <lineSegments>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.35} />
        </lineSegments>
      ) : null}
    </group>
  );
};

/** Small spheres circling the object on a tilted ring. */
const Satellites: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  return (
    <group rotation={[1.1, 0, 0.3]}>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + frame * 0.03;
        const show = progress(frame, 8 + i * 3, 20 + i * 3);
        return (
          <mesh key={i} position={[Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0]} scale={0.12 * show}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshStandardMaterial color={i % 2 ? '#ffffff' : color} emissive={i % 2 ? '#222' : color} emissiveIntensity={0.6} />
          </mesh>
        );
      })}
    </group>
  );
};

/**
 * Three.js object: a glossy 3D shape lit by a key light, an accent-coloured rim and a soft fill turns
 * slowly above the speaker, with satellites circling it and the beat's word set big underneath.
 * Sits behind the speaker when there is a matte.
 */
export const Object3D: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useSource();
  const family = s.style.font ? FONT_FAMILY[s.style.font] : fonts.display;
  const word = seg.text ?? seg.emphasis[0] ?? '';
  const kind = SHAPES[Math.floor(rand(word.length + (seg.caption?.length ?? 0)) * SHAPES.length)];
  const t = pop(frame, fps, 6, 15);
  const dim = progress(frame, 0, 10);
  return (
    <AbsoluteFill>
      <Footage />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, ${s.accent}33, rgba(0,0,0,0.82) 62%)`, opacity: dim }} />
      <AbsoluteFill style={{ top: -300 }}>
        <ThreeCanvas width={W} height={H} camera={{ position: [0, 0, 8.4], fov: 40 }} gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 4, 5]} intensity={2.2} />
          <pointLight position={[-4, -1, 2]} intensity={40} color={s.accent} />
          <pointLight position={[2, -3, -3]} intensity={25} color="#7aa8ff" />
          <Shape kind={kind} color={s.accent} />
          <Satellites color={s.accent} />
        </ThreeCanvas>
      </AbsoluteFill>
      {word ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 1010,
            textAlign: 'center',
            fontFamily: family,
            fontWeight: 800,
            fontSize: Math.min(170, 1500 / Math.max(4, [...word].length)),
            letterSpacing: '-0.03em',
            color: '#fff',
            textTransform: 'uppercase',
            opacity: t,
            transform: `translateY(${(1 - t) * 60}px)`,
            textShadow: `0 0 40px ${s.accent}88`,
          }}
        >
          {word}
        </div>
      ) : null}
      <Subject />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.76} />
    </AbsoluteFill>
  );
};

const N = 5200;

const Galaxy: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const a = new THREE.Color(color);
    const b = new THREE.Color('#ffffff');
    for (let i = 0; i < N; i++) {
      const arm = i % 3;
      const r = Math.pow(rand(i * 3.1), 0.7) * 6;
      const spin = r * 1.25;
      const angle = (arm / 3) * Math.PI * 2 + spin + (rand(i * 7.7) - 0.5) * 0.6;
      const spread = (1 - r / 7) * 0.5 + 0.08;
      positions[i * 3] = Math.cos(angle) * r + (rand(i * 1.3) - 0.5) * spread;
      positions[i * 3 + 1] = (rand(i * 2.9) - 0.5) * spread * 0.9;
      positions[i * 3 + 2] = Math.sin(angle) * r + (rand(i * 5.3) - 0.5) * spread;
      const c = b.clone().lerp(a, Math.min(1, r / 3.2));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    return { positions, colors };
  }, [color]);
  return (
    <points rotation={[0.55, frame * 0.012, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.045} vertexColors transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
};

/** Flies the camera from far out into the galaxy's core over the beat. */
const CameraRig: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [13, 4.6], { ...clamp, easing: easeOutExpo });
  const set = (cam: THREE.Camera) => {
    cam.position.set(0, 1.2 + z * 0.12, z);
    cam.lookAt(0, 0, 0);
  };
  return <CamSetter set={set} />;
};

const CamSetter: React.FC<{ set: (cam: THREE.Camera) => void }> = ({ set }) => {
  const camera = useThree((st) => st.camera);
  set(camera);
  return null;
};

/**
 * Three.js particles: thousands of points form a spinning spiral galaxy in the accent colour while the
 * camera flies into its core; the key word glows in the middle. Behind the speaker when there is a matte.
 */
export const Particles3D: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useSource();
  const family = s.style.font ? FONT_FAMILY[s.style.font] : fonts.display;
  const word = seg.text ?? seg.emphasis[0] ?? '';
  const t = pop(frame, fps, 10, 16);
  return (
    <AbsoluteFill>
      <Footage />
      <AbsoluteFill style={{ background: '#05040a', opacity: progress(frame, 0, 8) * 0.88 }} />
      <ThreeCanvas width={W} height={H} camera={{ position: [0, 2.8, 13], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <CameraRig />
        <Galaxy color={s.accent} />
      </ThreeCanvas>
      {word ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 560,
            textAlign: 'center',
            fontFamily: family,
            fontWeight: 800,
            fontSize: Math.min(180, 1500 / Math.max(4, [...word].length)),
            color: '#fff',
            letterSpacing: `${(1 - t) * 0.4}em`,
            opacity: t,
            textShadow: `0 0 30px ${s.accent}, 0 0 80px ${s.accent}`,
            textTransform: 'uppercase',
          }}
        >
          {word}
        </div>
      ) : null}
      <Subject />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.74} />
    </AbsoluteFill>
  );
};

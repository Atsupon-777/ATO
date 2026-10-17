import React from 'react';
import { Composition } from 'remotion';
import { FPS, beatFrames } from './lib/timing';
import { ProductShine, productShineBeats } from './templates/ProductShine';
import {
  effectsReelSchema,
  productShineSchema,
  saasPromoSchema,
  talkCaptionsSchema,
  type EffectsReelProps,
  type TalkCaptionsProps,
} from './schemas';
import productWatch from '../props/product-watch.json';
import { SaaSPromo, saasPromoBeats } from './templates/SaaSPromo';
import saasSample from '../props/saas-sample.json';
import { TalkCaptions, talkCaptionsDuration } from './templates/TalkCaptions';
import talkSample from '../props/talk-sample.json';
import { EffectsReel, effectsReelDuration } from './templates/EffectsReel';
import effectsDemo from '../props/effects-demo.json';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ProductShine"
      component={ProductShine}
      schema={productShineSchema}
      defaultProps={productWatch}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={Math.round(productShineBeats(productWatch) * beatFrames(productWatch.bpm))}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(productShineBeats(props) * beatFrames(props.bpm)),
      })}
    />
    <Composition
      id="SaaSPromo"
      component={SaaSPromo}
      schema={saasPromoSchema}
      defaultProps={saasSample as never}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={Math.round(saasPromoBeats * beatFrames(saasSample.bpm))}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(saasPromoBeats * beatFrames(props.bpm)),
      })}
    />
    <Composition
      id="TalkCaptions"
      component={TalkCaptions}
      schema={talkCaptionsSchema}
      defaultProps={talkSample as TalkCaptionsProps}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={talkCaptionsDuration(talkSample as TalkCaptionsProps, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: talkCaptionsDuration(props, FPS) })}
    />
    <Composition
      id="EffectsReel"
      component={EffectsReel}
      schema={effectsReelSchema}
      defaultProps={effectsDemo as EffectsReelProps}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={effectsReelDuration(effectsDemo as EffectsReelProps, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: effectsReelDuration(props, FPS) })}
    />
  </>
);

import React from 'react';
import { Composition } from 'remotion';
import { FPS, beatFrames } from './lib/timing';
import { ProductShine, productShineFrames } from './templates/ProductShine';
import {
  effectsReelSchema,
  fivePassSchema,
  productFilmSchema,
  type ProductFilmProps,
  type FivePassProps,
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
import { FivePass, fivePassDuration } from './templates/FivePass';
import fivePassDemo from '../props/fivepass-demo.json';
import { ProductFilm, productFilmDuration } from './templates/ProductFilm';
import filmDemo from '../props/film-demo.json';

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
      durationInFrames={productShineFrames(productWatch, FPS)}
      calculateMetadata={({ props }) => ({
        durationInFrames: productShineFrames(props, FPS),
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
    <Composition
      id="FivePass"
      component={FivePass}
      schema={fivePassSchema}
      defaultProps={fivePassDemo as FivePassProps}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={fivePassDuration(fivePassDemo as FivePassProps, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: fivePassDuration(props, FPS) })}
    />
    <Composition
      id="ProductFilm"
      component={ProductFilm}
      schema={productFilmSchema}
      defaultProps={filmDemo as ProductFilmProps}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={productFilmDuration(filmDemo as ProductFilmProps, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: productFilmDuration(props, FPS) })}
    />
  </>
);

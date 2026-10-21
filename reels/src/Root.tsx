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
import { PhotoReel, photoReelDuration } from './templates/PhotoReel';
import { photoReelSchema, type PhotoReelProps } from './photoreel';
import photoCinematic from '../props/photo-cinematic.json';

// Remotion merges defaultProps under a job's props, so the PhotoReel defaults carry only required fields:
// an optional field left out of a job (handle, cta, captions…) must stay empty, not show sample text.
const photoDefaults: PhotoReelProps = {
  photos: photoCinematic.photos.map(({ src }) => ({ src })),
  title: photoCinematic.title,
  motion: 'cinematic',
  style: 'editorial',
  palette: photoCinematic.palette,
  bpm: photoCinematic.bpm,
};
import { ServiceReel, serviceReelDuration } from './templates/ServiceReel';
import { serviceReelSchema, type ServiceReelProps } from './servicereel';
import serviceFeatures from '../props/service-features.json';

// Remotion merges defaultProps under every input, so ServiceReel's default carries only required fields:
// a real job must never inherit a sample's logo, photos, stats or testimonial.
const serviceDefault: ServiceReelProps = {
  layout: 'features',
  screen: 'none',
  style: serviceFeatures.style as ServiceReelProps['style'],
  name: serviceFeatures.name,
  tagline: serviceFeatures.tagline,
  hook: serviceFeatures.hook,
  features: serviceFeatures.features.map((f) => ({ title: f.title })),
  cta: serviceFeatures.cta,
  accent: serviceFeatures.accent,
  bpm: serviceFeatures.bpm,
};

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
    <Composition
      id="PhotoReel"
      component={PhotoReel}
      schema={photoReelSchema}
      defaultProps={photoDefaults}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={photoReelDuration(photoDefaults, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: photoReelDuration(props, FPS) })}
    />
    <Composition
      id="ServiceReel"
      component={ServiceReel}
      schema={serviceReelSchema}
      defaultProps={serviceDefault}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={serviceReelDuration(serviceDefault, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: serviceReelDuration(props, FPS) })}
    />
  </>
);

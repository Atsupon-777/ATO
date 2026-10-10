import React from 'react';
import { Composition } from 'remotion';
import { FPS, beatFrames } from './lib/timing';
import { ProductShine, productShineBeats } from './templates/ProductShine';
import { productShineSchema, saasPromoSchema, talkCaptionsSchema, type TalkCaptionsProps } from './schemas';
import productWatch from '../props/product-watch.json';
import { SaaSPromo, saasPromoBeats } from './templates/SaaSPromo';
import saasAto from '../props/saas-ato.json';
import { TalkCaptions, talkCaptionsDuration } from './templates/TalkCaptions';
import talkAto from '../props/talk-ato.json';

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
      defaultProps={saasAto as never}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={Math.round(saasPromoBeats * beatFrames(saasAto.bpm))}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(saasPromoBeats * beatFrames(props.bpm)),
      })}
    />
    <Composition
      id="TalkCaptions"
      component={TalkCaptions}
      schema={talkCaptionsSchema}
      defaultProps={talkAto as TalkCaptionsProps}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={talkCaptionsDuration(talkAto as TalkCaptionsProps, FPS)}
      calculateMetadata={({ props }) => ({ durationInFrames: talkCaptionsDuration(props, FPS) })}
    />
  </>
);

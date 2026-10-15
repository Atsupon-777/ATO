import type React from 'react';
import type { EffectId } from '../schemas';
import type { EffectProps } from './layers';
import { ChartGrow, CouchWall, CoverStory, GlassType, HeadlineWall, Orbit } from './Behind';
import { DigitalZoom, FrameBreak, PullBack, Vertigo, ZoomThrough } from './Camera';
import { Checklist, GreenScreen, PhoneMockup, UiWorld } from './Ui';
import { DoodleBoil, PaperCut } from './Craft';

/** Effect id → component. Order and names follow notes/video-effects.md (01–17). */
export const effects: Record<EffectId, React.FC<EffectProps>> = {
  orbit: Orbit,
  couchWall: CouchWall,
  uiWorld: UiWorld,
  frameBreak: FrameBreak,
  digitalZoom: DigitalZoom,
  phoneMockup: PhoneMockup,
  checklist: Checklist,
  headlineWall: HeadlineWall,
  zoomThrough: ZoomThrough,
  chartGrow: ChartGrow,
  pullBack: PullBack,
  greenScreen: GreenScreen,
  paperCut: PaperCut,
  doodleBoil: DoodleBoil,
  vertigo: Vertigo,
  coverStory: CoverStory,
  glassType: GlassType,
};

/** Whether an effect only reads correctly with a person matte (it still renders without one). */
export const needsMatte: Record<EffectId, boolean> = {
  orbit: true,
  couchWall: true,
  uiWorld: false,
  frameBreak: true,
  digitalZoom: false,
  phoneMockup: false,
  checklist: false,
  headlineWall: true,
  zoomThrough: false,
  chartGrow: true,
  pullBack: false,
  greenScreen: true,
  paperCut: true,
  doodleBoil: true,
  vertigo: true,
  coverStory: true,
  glassType: true,
};

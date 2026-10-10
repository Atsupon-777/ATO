import { useState } from 'react';
import { loadFonts } from './fonts';

/** Collects every string in the props and loads the glyphs for them before the first frame. */
export const useFonts = (props: unknown) => {
  useState(() => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(props);
    loadFonts(strings.join(''));
    return null;
  });
};

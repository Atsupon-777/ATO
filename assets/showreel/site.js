/* ATO — Showreel 2026 (v3)
   One rAF loop drives everything that moves with time or scroll; CSS does the rest.
   Every module checks that its elements exist, so the same file serves the home page,
   /about and the four service pages. Only transforms, opacity and canvases are animated. */
(function(){
  'use strict';
  var doc=document, html=doc.documentElement, body=doc.body;
  var $=function(id){return doc.getElementById(id);};
  var $$=function(sel,root){return [].slice.call((root||doc).querySelectorAll(sel));};
  var reduce=html.classList.contains('rm');
  var BEAT=468.75, D2R=Math.PI/180;
  var lang=html.getAttribute('data-lang')==='en'?'en':'ja';
  var paused=html.classList.contains('paused');
  function clamp(v,a,b){return v<a?a:(v>b?b:v);}
  function lerp(a,b,t){return a+(b-a)*t;}
  function easeOutExpo(t){return t>=1?1:1-Math.pow(2,-10*t);}
  function easeIO(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  var isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  var fine=window.matchMedia&&window.matchMedia('(pointer:fine)').matches;
  var hasIO='IntersectionObserver' in window;

  /* ------------------------------------------------------------
     split text into masked characters, grouped into phrases (screen readers get a plain copy)
     ------------------------------------------------------------ */
  var CJK=/[　-ヿ㐀-鿿豈-﫿＀-￯]/;
  var CLOSE=/[、。，．！？」』）〕】・ー…：；!?,.)]/, OPEN=/[「『（〔【(“]/;
  var SEG=null; try{if(window.Intl&&Intl.Segmenter)SEG=new Intl.Segmenter('ja',{granularity:'word'});}catch(e){}
  var HIRA=/^[぀-ゟ]+$/, PUNCT_END=/[、。，．！？」』）〕】…：；!?,.)]$/, DIGITS=/^[0-9０-９.,]+$/;
  function tokens(str){
    if(SEG&&CJK.test(str)){
      var out=[], segs=Array.from(SEG.segment(str));
      for(var k=0;k<segs.length;k++){
        var t=segs[k].segment, prev=out.length?out[out.length-1]:null;
        if(/^\s+$/.test(t)){out.push(' ');continue;}
        var attach=prev&&prev!==' '&&!PUNCT_END.test(prev)&&(CLOSE.test(t.charAt(0))||(HIRA.test(t)&&t.length<=3)||(DIGITS.test(prev)&&CJK.test(t.charAt(0)))||(prev.length===1&&HIRA.test(prev))||OPEN.test(prev.charAt(prev.length-1)));
        if(!attach&&prev&&prev!==' '&&CLOSE.test(t.charAt(0)))attach=true;
        if(attach)out[out.length-1]+=t; else out.push(t);
      }
      return out;
    }
    var out2=[], cur='', chars=Array.from(str);
    function push(){if(cur){out2.push(cur);cur='';}}
    for(var j=0;j<chars.length;j++){
      var ch=chars[j];
      if(/\s/.test(ch)){push(); out2.push(' '); continue;}
      if(CJK.test(ch)){
        if(CLOSE.test(ch)&&out2.length&&out2[out2.length-1]!==' '&&!cur){out2[out2.length-1]+=ch; continue;}
        push();
        if(OPEN.test(ch)&&j+1<chars.length){out2.push(ch+chars[j+1]); j++; continue;}
        out2.push(ch); continue;
      }
      if(CLOSE.test(ch)&&!cur&&out2.length&&out2[out2.length-1]!==' '){out2[out2.length-1]+=ch; continue;}
      cur+=ch;
    }
    push(); return out2;
  }
  function split(el){
    if(el.classList.contains('sp'))return;
    var text=el.textContent.replace(/\s+/g,' ').trim();
    var sr=doc.createElement('span'); sr.className='sr'; sr.textContent=text;
    var vis=doc.createElement('span'); vis.setAttribute('aria-hidden','true');
    while(el.firstChild)vis.appendChild(el.firstChild);
    var i=0;
    (function walk(node){
      [].slice.call(node.childNodes).forEach(function(n){
        if(n.nodeType===3){
          var frag=doc.createDocumentFragment();
          tokens(n.textContent).forEach(function(tk){
            if(tk===' '){frag.appendChild(doc.createTextNode(' '));return;}
            var w=doc.createElement('span'); w.className='w';
            Array.from(tk).forEach(function(ch){
              var c=doc.createElement('span'); c.className='c';
              var inner=doc.createElement('i'); inner.textContent=ch; inner.style.setProperty('--i',i++);
              c.appendChild(inner); w.appendChild(c);
            });
            frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag,n);
        } else if(n.nodeType===1){walk(n);}
      });
    })(vis);
    el.appendChild(sr); el.appendChild(vis); el.classList.add('sp');
  }
  $$('[data-split]').forEach(split);
  $$('.beat h2>span').forEach(split);

  /* ------------------------------------------------------------
     smooth wheel scrolling (desktop only; touch stays native)
     ------------------------------------------------------------ */
  // every page opens at its top; only a link that names a section (#contact) lands further down
  if(!location.hash&&(window.pageYOffset||html.scrollTop))window.scrollTo(0,0);
  var lenis=null;
  if(!reduce&&window.Lenis&&fine&&!isTouch){
    try{lenis=new window.Lenis({lerp:.085,wheelMultiplier:.95,smoothWheel:true,autoRaf:false});}catch(e){lenis=null;}
  }
  // a page someone just opened stays at its top until they scroll: some viewers (the Claude preview, in-app browsers)
  // put the previous page's scroll position back after the page has loaded
  (function(){
    if(location.hash) return;
    var touched=false, until=performance.now()+4000;
    var mark=function(){touched=true;};
    ['wheel','touchstart','keydown','pointerdown'].forEach(function(t){window.addEventListener(t,mark,{passive:true,capture:true});});
    var toTop=function(){
      if(touched||performance.now()>until) return;
      if((window.pageYOffset||html.scrollTop)>2){
        if(lenis){try{lenis.scrollTo(0,{immediate:true,force:true});}catch(e){}}
        window.scrollTo(0,0);
      }
    };
    var onScroll=function(){ if(touched||performance.now()>until){window.removeEventListener('scroll',onScroll);return;} toTop(); };
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('load',toTop); window.addEventListener('pageshow',toTop);
    [0,120,400,900,1600,2500,3600].forEach(function(ms){setTimeout(toTop,ms);});
  })();

  /* ------------------------------------------------------------
     elements (any of these may be missing on a given page)
     ------------------------------------------------------------ */
  var hero=$('top'), heroIn=$('heroIn'), heroFoot=$('heroFoot'), dial=$('dial'), reachSec=$('reach');
  var nav=$('nav');
  var maxDpr=3; // lowered to 1 if the device cannot keep up (see perfWatch)
  var isHome=html.getAttribute('data-page')==='home'&&!!dial;
  var flowLists=$$('.flow');
  var vw=window.innerWidth, vh=window.innerHeight, docH=1, L={heroH:0,flows:[],secs:[],tones:[]};
  function top(el){var t=0; while(el){t+=el.offsetTop; el=el.offsetParent;} return t;}
  function measure(){
    vw=window.innerWidth; vh=window.innerHeight; docH=Math.max(1,html.scrollHeight-vh);
    L.heroH=isHome?hero.offsetHeight:0;
    L.flows=flowLists.map(function(f){return [top(f),f.offsetHeight];});
    L.secs=SECS.map(function(s){return top(s.el);});
    L.tones=$$('[data-tone="light"]').map(function(e){var t=top(e); return [t,t+e.offsetHeight];});
    measureFills(); sizeGlobes(); measureHud(); layoutDirty=true;
  }
  var rlT=0;
  function relayoutSoon(){clearTimeout(rlT); rlT=setTimeout(measure,140);}

  /* ------------------------------------------------------------
     world data → unit vectors
     ------------------------------------------------------------ */
  function v3(lat,lon){var p=lat*D2R,l=lon*D2R,c=Math.cos(p);return [c*Math.sin(l),Math.sin(p),c*Math.cos(l)];}
  var LAND=null, JPN=null, GRAT=[];
  (function(){
    var M=window.ATO_MAP; if(!M)return;
    var land=[], jp=[];
    for(var r=0;r<M.rows;r++){
      var hex=M.hex[r], c=0;
      for(var k=0;k<hex.length;k++){
        var nib=parseInt(hex[k],16);
        for(var b=3;b>=0;b--){
          var la=M.latTop-r*M.step, keepEvery=Math.max(1,Math.round(1/Math.cos(la*D2R)));
          if(c<M.cols&&(nib>>b)&1&&(c%keepEvery===0)){
            var lo=M.lon0+c*M.step, v=v3(la,lo);
            var isJp=la>30&&la<46&&lo>129.3&&lo<146&&!(la>41.4&&lo<139.6)&&!(la>34.6&&lo<130.8);
            (isJp?jp:land).push(v[0],v[1],v[2]);
          }
          c++;
        }
      }
    }
    LAND=new Float32Array(land); JPN=new Float32Array(jp);
    for(var lo2=-180;lo2<180;lo2+=30){var m=[]; for(var la2=-80;la2<=80;la2+=4)m.push(v3(la2,lo2)); GRAT.push(m);}
    for(var la3=-60;la3<=60;la3+=30){var pl=[]; for(var lo3=-180;lo3<=180;lo3+=4)pl.push(v3(la3,lo3)); GRAT.push(pl);}
  })();
  var TOKYO=v3(35.68,139.69);
  var CITIES=[['TPE',25.03,121.56],['HKG',22.32,114.17],['SHA',31.23,121.47],['MNL',14.6,120.98],['BKK',13.75,100.5],['SGN',10.82,106.63],['SIN',1.35,103.82],['KUL',3.14,101.69],['JKT',-6.2,106.85],['DEL',28.61,77.21],['BOM',19.08,72.88],['DXB',25.2,55.27],['SYD',-33.87,151.21],['MEL',-37.81,144.96],['AKL',-36.85,174.76],['HNL',21.31,-157.86],['LON',51.51,-.13],['PAR',48.86,2.35],['BER',52.52,13.4],['MAD',40.42,-3.7],['ROM',41.9,12.5],['IST',41.0,28.98],['STO',59.33,18.07],['CAI',30.04,31.24],['NBO',-1.29,36.82],['JNB',-26.2,28.05],['YVR',49.28,-123.12],['SFO',37.77,-122.42],['LAX',34.05,-118.24],['CHI',41.88,-87.63],['NYC',40.71,-74.0],['YYZ',43.65,-79.38],['MEX',19.43,-99.13],['SAO',-23.55,-46.63],['LIM',-12.05,-77.04],['SEL',37.57,126.98],['PUS',35.18,129.08],['HAN',21.03,105.85],['CEB',10.32,123.89],['DAC',23.81,90.41],['CMB',6.93,79.86],['DOH',25.29,51.53],['TLV',32.09,34.78],['BNE',-27.47,153.03],['PER',-31.95,115.86],['GUM',13.44,144.79],['ANC',61.22,-149.9],['SEA',47.61,-122.33],['DEN',39.74,-104.99],['DFW',32.78,-96.8],['ATL',33.75,-84.39],['MIA',25.76,-80.19],['BOS',42.36,-71.06],['BOG',4.71,-74.07],['SCL',-33.45,-70.67],['EZE',-34.6,-58.38],['AMS',52.37,4.9],['DUB',53.35,-6.26],['LIS',38.72,-9.14],['VIE',48.21,16.37],['HEL',60.17,24.94],['ATH',37.98,23.73],['CMN',33.57,-7.59],['LOS',6.52,3.38],['ADD',9.0,38.75]]
    .map(function(c){return {code:c[0],lat:c[1],lon:c[2],v:v3(c[1],c[2])};});
  var CITY={}; CITIES.forEach(function(c){CITY[c.code]=c;});
  function inLon(a,b){return CITIES.filter(function(c){return c.lon>=a&&c.lon<=b;});}
  var seed=7; function rnd(){seed=(seed*16807)%2147483647; return (seed-1)/2147483646;}
  function pick(list,n){var a=list.slice(); for(var j=a.length-1;j>0;j--){var k=Math.floor(rnd()*(j+1)),t=a[j];a[j]=a[k];a[k]=t;} return a.slice(0,n);}

  function sprite(inner,mid,rgb){
    var cv=doc.createElement('canvas'); cv.width=cv.height=64; var g=cv.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,inner); gr.addColorStop(.35,mid); gr.addColorStop(1,'rgba('+rgb+',0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return cv;
  }
  var SPR={gold:sprite('rgba(255,236,214,1)','rgba(255,140,80,.55)','255,107,61'),white:sprite('rgba(255,246,236,1)','rgba(255,214,170,.4)','255,214,170'),jp:sprite('rgba(255,240,214,1)','rgba(255,80,46,.6)','255,70,46')};
  var ORB=(function(){
    var cv=doc.createElement('canvas'), S=500, R=200; cv.width=cv.height=S; var g=cv.getContext('2d'), c=S/2;
    var at=g.createRadialGradient(c,c,R*.92,c,c,R*1.25); at.addColorStop(0,'rgba(255,107,61,.2)'); at.addColorStop(.3,'rgba(255,107,61,.07)'); at.addColorStop(1,'rgba(255,107,61,0)');
    g.fillStyle=at; g.fillRect(0,0,S,S);
    var bd=g.createRadialGradient(c-R*.32,c-R*.38,R*.1,c,c,R); bd.addColorStop(0,'#2A1612'); bd.addColorStop(.62,'#170C09'); bd.addColorStop(1,'#0B0605');
    g.fillStyle=bd; g.beginPath(); g.arc(c,c,R,0,6.2832); g.fill(); return cv;
  })();

  /* ------------------------------------------------------------
     WebGL renderer for the sphere and its land dots (falls back to 2D)
     ------------------------------------------------------------ */
  function GLGlobe(canvas){
    var gl=null;
    try{gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});}catch(e){}
    if(!gl||!LAND)return null;
    // a software rasteriser (no GPU) draws the 2D version faster: hand back and let the caller fall back
    try{var dbg=gl.getExtension('WEBGL_debug_renderer_info'), ren=dbg?String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)):'';
      if(/swiftshader|llvmpipe|softpipe|software|basic render/i.test(ren)){var lc=gl.getExtension('WEBGL_lose_context'); if(lc)lc.loseContext(); return null;}}catch(e){}
    function sh(type,src){var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)); return s;}
    function prog(vs,fs){var p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link'); return p;}
    var dots, orb;
    try{
      dots=prog(
        'attribute vec4 aP;uniform vec4 uRot;uniform vec3 uCam;uniform vec2 uRes;uniform float uDpr,uBase,uJp;varying float vA;varying float vJ;varying float vS;'+
        'void main(){float x=aP.x*uRot.x-aP.z*uRot.y;float z1=aP.z*uRot.x+aP.x*uRot.y;float y=aP.y*uRot.z-z1*uRot.w;float z=aP.y*uRot.w+z1*uRot.z;'+
        'vec2 s=vec2(uCam.x+uCam.z*x,uCam.y-uCam.z*y);gl_Position=z>0.1?vec4(s.x/uRes.x*2.0-1.0,1.0-s.y/uRes.y*2.0,0.0,1.0):vec4(-2.0,-2.0,0.0,1.0);'+
        'float jp=aP.w;float sz=uBase*(0.55+0.45*z)*(jp>0.5?1.3:1.0)*2.0*uDpr;gl_PointSize=max(sz,1.0);vS=sz;vJ=jp;'+
        'vA=jp>0.5?(0.5+0.5*uJp):mix(0.14,0.62,smoothstep(0.1,1.0,z));}',
        'precision mediump float;varying float vA;varying float vJ;varying float vS;'+
        'void main(){vec2 c=gl_PointCoord*2.0-1.0;float r=length(c);float aa=clamp(2.0/vS,0.05,0.6);float a=(1.0-smoothstep(1.0-aa,1.0,r))*vA;'+
        'vec3 col=vJ>0.5?vec3(1.0,0.275,0.18):vec3(1.0,0.91,0.84);gl_FragColor=vec4(col*a,a);}');
      orb=prog(
        'attribute vec2 aC;uniform vec3 uCam;uniform vec2 uRes;varying vec2 vU;void main(){vU=aC*1.3;vec2 s=uCam.xy+aC*uCam.z*1.3*vec2(1.0,-1.0);gl_Position=vec4(s.x/uRes.x*2.0-1.0,1.0-s.y/uRes.y*2.0,0.0,1.0);}',
        'precision mediump float;varying vec2 vU;uniform float uPx;'+
        'void main(){float d=length(vU);float aa=uPx;float inside=1.0-smoothstep(1.0-aa,1.0,d);'+
        'float hl=clamp(length(vU-vec2(-0.32,0.38))/1.3,0.0,1.0);vec3 body=mix(vec3(0.165,0.086,0.071),vec3(0.043,0.024,0.02),hl);float lit=max(0.0,dot(normalize(vU+vec2(0.0001)),vec2(0.674,0.739)));'+
        'float atm=(1.0-smoothstep(1.0,1.25,d))*0.22*(0.4+0.6*lit)*(1.0-inside);float rim=smoothstep(1.0-aa*3.0,1.0,d)*inside*(0.28+0.72*lit);'+
        'vec3 col=body*inside+vec3(1.0,0.42,0.24)*atm+vec3(1.0,0.66,0.4)*rim;float a=inside+atm;gl_FragColor=vec4(col,a);}');
    }catch(e){return null;}
    var n1=LAND.length/3, n2=JPN.length/3, buf=new Float32Array((n1+n2)*4), o=0;
    for(var i=0;i<n1;i++){buf[o++]=LAND[i*3];buf[o++]=LAND[i*3+1];buf[o++]=LAND[i*3+2];buf[o++]=0;}
    for(var j=0;j<n2;j++){buf[o++]=JPN[j*3];buf[o++]=JPN[j*3+1];buf[o++]=JPN[j*3+2];buf[o++]=1;}
    var vb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,buf,gl.STATIC_DRAW);
    var qb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,qb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    var U=function(p,n){return gl.getUniformLocation(p,n);};
    var ud={rot:U(dots,'uRot'),cam:U(dots,'uCam'),res:U(dots,'uRes'),dpr:U(dots,'uDpr'),base:U(dots,'uBase'),jp:U(dots,'uJp')}, aP=gl.getAttribLocation(dots,'aP');
    var uo={cam:U(orb,'uCam'),res:U(orb,'uRes'),px:U(orb,'uPx')}, aC=gl.getAttribLocation(orb,'aC');
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    return {
      gl:gl, total:n1+n2,
      draw:function(c,W,H,d,jl){
        gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(orb); gl.bindBuffer(gl.ARRAY_BUFFER,qb); gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC,2,gl.FLOAT,false,0,0);
        gl.uniform3f(uo.cam,c.cx,c.cy,c.R); gl.uniform2f(uo.res,W,H); gl.uniform1f(uo.px,1.5/Math.max(1,c.R*d)); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        gl.disableVertexAttribArray(aC);
        gl.useProgram(dots); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,4,gl.FLOAT,false,0,0);
        gl.uniform4f(ud.rot,c.cl,c.sl,c.cp,c.sp); gl.uniform3f(ud.cam,c.cx,c.cy,c.R); gl.uniform2f(ud.res,W,H); gl.uniform1f(ud.dpr,d);
        gl.uniform1f(ud.base,clamp(c.R*.0105,.7,4.2)); gl.uniform1f(ud.jp,jl);
        gl.drawArrays(gl.POINTS,0,n1+n2); gl.disableVertexAttribArray(aP);
      }
    };
  }

  /* ------------------------------------------------------------
     Globe: orthographic Earth; arcs, pings and labels on a 2D overlay
     ------------------------------------------------------------ */
  function Globe(cv){
    this.cv=cv; this.g=cv.getContext('2d');
    this.W=0; this.H=0; this.dpr=1; this.arcs=[]; this.pings=[]; this.parts=[]; this.lt=0;
    this.cam={lon:140,lat:30,R:100,cx:0,cy:0,cl:1,sl:0,cp:1,sp:0};
    this.glc=doc.createElement('canvas'); this.glc.className='globe-cv globe-gl'; this.glc.setAttribute('aria-hidden','true');
    cv.parentNode.insertBefore(this.glc,cv);
    this.glr=null;
    try{this.glr=GLGlobe(this.glc);}catch(e){this.glr=null;}
    var self=this;
    if(this.glr)this.glc.addEventListener('webglcontextlost',function(e){e.preventDefault(); self.glr=null; self.glc.style.display='none';});
    else this.glc.style.display='none';
  }
  Globe.prototype.size=function(){
    var r=this.cv.getBoundingClientRect(), w=Math.round(r.width), h=Math.round(r.height); if(!w||!h)return false;
    var d=Math.min(window.devicePixelRatio||1,vw<700?1.75:2,maxDpr);
    if(w===this.W&&h===this.H&&d===this.dpr)return true;
    this.W=w; this.H=h; this.dpr=d;
    this.cv.width=this.glc.width=Math.round(w*d); this.cv.height=this.glc.height=Math.round(h*d); return true;
  };
  Globe.prototype.setCam=function(lon,lat,R,cx,cy){
    var c=this.cam; c.lon=lon; c.lat=lat; c.R=R; c.cx=cx; c.cy=cy;
    c.cl=Math.cos(lon*D2R); c.sl=Math.sin(lon*D2R); c.cp=Math.cos(lat*D2R); c.sp=Math.sin(lat*D2R);
  };
  Globe.prototype.p=function(x0,y0,z0,out){
    var c=this.cam, x=x0*c.cl-z0*c.sl, z1=z0*c.cl+x0*c.sl, y=y0*c.cp-z1*c.sp, z=y0*c.sp+z1*c.cp;
    out[0]=c.cx+c.R*x; out[1]=c.cy-c.R*y; out[2]=z; out[3]=x; out[4]=y; return out;
  };
  Globe.prototype.arc=function(a,b,o){
    var dot=clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1), om=Math.acos(dot);
    this.arcs.push({a:a,b:b,om:om,so:Math.sin(om)||1e-6,t0:o.t0,dur:o.dur,kind:o.kind||'out',w:o.w||1.4,hold:o.hold==null?900:o.hold,h:o.h==null?(.05+.22*om/Math.PI):o.h,city:o.city,tag:o.tag,label:o.label});
  };
  Globe.prototype.pt=function(A,t,out){
    var s1=Math.sin((1-t)*A.om)/A.so, s2=Math.sin(t*A.om)/A.so, lift=1+A.h*Math.sin(Math.PI*t);
    return this.p((A.a[0]*s1+A.b[0]*s2)*lift,(A.a[1]*s1+A.b[1]*s2)*lift,(A.a[2]*s1+A.b[2]*s2)*lift,out);
  };
  var TMP=[0,0,0,0,0], TMP2=[0,0,0,0,0];
  Globe.prototype.draw=function(now,fx){
    var c=this.cam, d=this.dpr, g=this.g, jl=fx&&fx.jp!=null?fx.jp:1;
    if(this.glr){
      this.glr.draw(c,this.W,this.H,d,jl);
      g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,this.cv.width,this.cv.height); g.setTransform(d,0,0,d,0,0);
      this.drawGrat(g);
    } else {
      // the camera never stops, so the sphere and its dots are drawn straight onto the canvas every frame
      g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,this.cv.width,this.cv.height); g.setTransform(d,0,0,d,0,0);
      this.drawBase(fx);
    }
    this.drawTokyo(now,fx); this.drawArcs(now); this.drawPings(now); this.drawParts(now);
  };
  Globe.prototype.drawGrat=function(g){
    g.strokeStyle='rgba(255,241,232,.05)'; g.lineWidth=1; g.beginPath();
    for(var q=0;q<GRAT.length;q++){
      var line=GRAT[q], pen=false;
      for(var k=0;k<line.length;k++){var v=line[k]; this.p(v[0],v[1],v[2],TMP); if(TMP[2]>0){if(pen)g.lineTo(TMP[0],TMP[1]); else g.moveTo(TMP[0],TMP[1]); pen=true;} else pen=false;}
    }
    g.stroke();
  };
  Globe.prototype.drawBase=function(fx){
    var g=this.g, c=this.cam, W=this.W, H=this.H, R=c.R;
    if(!LAND)return;
    g.drawImage(ORB,c.cx-R*1.25,c.cy-R*1.25,R*2.5,R*2.5);
    this.drawGrat(g);
    var base=clamp(R*.0105,.7,4.2), A=LAND, n=A.length, bands=[[],[],[],[]];
    var cl=c.cl, sl=c.sl, cp=c.cp, sp=c.sp, cx=c.cx, cy=c.cy;
    for(var i=0;i<n;i+=3){
      var x0=A[i], y0=A[i+1], z0=A[i+2], x=x0*cl-z0*sl, z1=z0*cl+x0*sl, z=y0*sp+z1*cp;
      if(z<=.1)continue;
      var sx=cx+R*x, y=y0*cp-z1*sp, sy=cy-R*y;
      if(sx<-6||sx>W+6||sy<-6||sy>H+6)continue;
      bands[z<.3?0:(z<.55?1:(z<.8?2:3))].push(sx,sy,base*(.55+.45*z));
    }
    var AL=[.16,.28,.42,.58], fast=fx&&fx.fast;
    for(var bb=0;bb<4;bb++){
      var arr=bands[bb]; if(!arr.length)continue;
      g.fillStyle='rgba(255,241,232,'+AL[bb]+')'; g.beginPath();
      if(fast)for(var jf=0;jf<arr.length;jf+=3){var rq=arr[jf+2]*.9; g.rect(arr[jf]-rq,arr[jf+1]-rq,rq*2,rq*2);}
      else for(var j=0;j<arr.length;j+=3){g.moveTo(arr[j]+arr[j+2],arr[j+1]); g.arc(arr[j],arr[j+1],arr[j+2],0,6.2832);}
      g.fill();
    }
    var J=JPN, jl=fx&&fx.jp!=null?fx.jp:1;
    g.fillStyle='rgba(255,70,46,'+(.55+.45*jl).toFixed(3)+')'; g.beginPath();
    for(var m=0;m<J.length;m+=3){this.p(J[m],J[m+1],J[m+2],TMP); if(TMP[2]<=.02)continue; var rr=base*1.3*(.6+.4*TMP[2]); g.moveTo(TMP[0]+rr,TMP[1]); g.arc(TMP[0],TMP[1],rr,0,6.2832);}
    g.fill();
    g.strokeStyle='rgba(255,140,80,.5)'; g.lineWidth=1.2; g.beginPath(); g.arc(cx,cy,R,0,6.2832); g.stroke();
  };
  Globe.prototype.drawTokyo=function(now,fx){
    var g=this.g, R=this.cam.R;
    this.p(TOKYO[0],TOKYO[1],TOKYO[2],TMP2);
    if(TMP2[2]<=0)return;
    var tx=TMP2[0], ty=TMP2[1], beatPh=fx&&fx.beat!=null?fx.beat:((now/BEAT)%2)/2;
    var gs=clamp(R*.07,10,34); g.globalCompositeOperation='lighter'; g.globalAlpha=.8; g.drawImage(SPR.jp,tx-gs*1.3,ty-gs*1.3,gs*2.6,gs*2.6); g.globalAlpha=1; g.globalCompositeOperation='source-over';
    for(var pr=0;pr<2;pr++){var ph=(((beatPh+pr*.5)%1)+1)%1; g.globalAlpha=(1-ph)*.8; g.strokeStyle='#FF462E'; g.lineWidth=1.4; g.beginPath(); g.arc(tx,ty,4+ph*R*.12,0,6.2832); g.stroke();}
    g.globalAlpha=1; g.fillStyle='#FFF4EC'; g.beginPath(); g.arc(tx,ty,clamp(R*.011,2,4),0,6.2832); g.fill();
  };
  var COL={out:'255,107,61',ship:'255,200,140',in:'255,240,220'};
  var COLB={out:['255,84,46','255,146,70','255,214,120'],ship:['255,190,130','255,210,160','255,232,200'],in:['255,190,150','255,220,190','255,240,220']};
  Globe.prototype.drawArcs=function(now){
    var g=this.g, keep=[];
    g.lineCap='round'; g.lineJoin='round';
    for(var i=0;i<this.arcs.length;i++){
      var A=this.arcs[i], age=now-A.t0;
      if(age<0){keep.push(A);continue;}
      var k=age/A.dur, head=easeIO(clamp(k,0,1)), fade=k<=1?1:clamp(1-(age-A.dur)/A.hold,0,1);
      if(fade<=0)continue; keep.push(A);
      var tail=Math.max(0,head-(A.kind==='in'?.5:.42));
      if(A.kind==='out')tail=0;
      var N=Math.max(10,Math.round(46*(head-tail))), cb=COLB[A.kind], col;
      for(var band=0;band<3;band++){
        var t0=tail+(head-tail)*band/3, t1=tail+(head-tail)*(band+1)/3, al=[.25,.55,1][band]*fade;
        if(A.kind==='out'&&k>1)al=.5*fade;
        col=cb[band]; g.strokeStyle='rgba('+col+','+al.toFixed(3)+')'; g.lineWidth=A.w*(band===2?1.15:.85);
        if(A.kind==='ship')g.setLineDash([3,4]);
        g.beginPath(); var pen=false, nn=Math.max(3,Math.round(N/3));
        for(var s=0;s<=nn;s++){
          this.pt(A,t0+(t1-t0)*s/nn,TMP);
          var vis=TMP[2]>0||(TMP[3]*TMP[3]+TMP[4]*TMP[4])>1;
          if(vis){if(pen)g.lineTo(TMP[0],TMP[1]); else g.moveTo(TMP[0],TMP[1]); pen=true;} else pen=false;
        }
        g.stroke(); if(A.kind==='ship')g.setLineDash([]);
      }
      if(k<1){
        this.pt(A,head,TMP); var hv=TMP[2]>0||(TMP[3]*TMP[3]+TMP[4]*TMP[4])>1;
        if(hv&&A.kind==='out'&&!reduce&&Math.random()<.6)this.emit(TMP[0],TMP[1],1,false);
        if(hv){
          var spr=A.kind==='out'?SPR.gold:SPR.white, sz=A.kind==='out'?16+A.w*3:14;
          g.globalCompositeOperation='lighter'; g.drawImage(spr,TMP[0]-sz,TMP[1]-sz,sz*2,sz*2); g.globalCompositeOperation='source-over';
          if(A.kind!=='out'){
            this.pt(A,Math.min(1,head+.01),TMP2); var ang=Math.atan2(TMP2[1]-TMP[1],TMP2[0]-TMP[0]);
            g.save(); g.translate(TMP[0],TMP[1]); g.rotate(ang);
            if(A.kind==='in'){g.fillStyle='#FFF4EC'; g.beginPath(); g.moveTo(7,0); g.lineTo(-5,-4.5); g.lineTo(-2.5,0); g.lineTo(-5,4.5); g.closePath(); g.fill();}
            else{g.fillStyle='#FFF4EC'; g.fillRect(-4,-3.5,8,7); g.fillStyle='#FF6B3D'; g.fillRect(-1,-3.5,2,7);}
            g.restore();
          }
        }
      } else if(!A.landed){
        A.landed=true;
        if(A.kind==='out'&&!reduce){this.p(A.b[0],A.b[1],A.b[2],TMP2); if(TMP2[2]>0)this.emit(TMP2[0],TMP2[1],12,true);}
        if(A.kind!=='in'&&A.city)this.pings.push({v:A.b,t0:now,kind:A.kind,label:A.label?A.city.code:null,tag:A.tag});
        if(A.kind==='in')this.pings.push({v:TOKYO,t0:now,kind:'in'});
      }
    }
    this.arcs=keep;
  };
  var TAGS={ja:['いいね','保存','シェア','コメント'],en:['LIKE','SAVE','SHARE','COMMENT']};
  Globe.prototype.drawPings=function(now){
    var g=this.g, keep=[];
    for(var i=0;i<this.pings.length;i++){
      var P=this.pings[i], k=(now-P.t0)/1300; if(k<0)k=0; if(k>=1&&!(P.label&&k<2.2))continue; keep.push(P);
      this.p(P.v[0],P.v[1],P.v[2],TMP); if(TMP[2]<=0)continue;
      var e=easeOutExpo(Math.min(1,k)), col=COL[P.kind]||COL.out;
      if(k<1){
        g.strokeStyle='rgba('+col+','+(1-k).toFixed(3)+')'; g.lineWidth=1.2; g.beginPath(); g.arc(TMP[0],TMP[1],2+e*(P.kind==='in'?26:18),0,6.2832); g.stroke();
        g.fillStyle='rgba('+col+','+(1-k*.6).toFixed(3)+')'; g.beginPath(); g.arc(TMP[0],TMP[1],2.2,0,6.2832); g.fill();
      }
      if(P.label){
        var la=k<.2?k/.2:(k>1.8?(2.2-k)/.4:1);
        g.globalAlpha=clamp(la,0,1); g.font='500 10px "IBM Plex Mono",ui-monospace,monospace'; g.fillStyle='#FFF1E8'; g.textBaseline='middle';
        g.fillText(P.label,TMP[0]+9,TMP[1]-9); g.globalAlpha=1;
      }
      if(P.tag!=null&&k<1){
        var txt=TAGS[lang][P.tag], tw, yy=TMP[1]-14-26*e, al2=k<.15?k/.15:1-((k-.15)/.85);
        g.font='600 10px "IBM Plex Mono","Noto Sans JP",monospace'; tw=g.measureText(txt).width+14;
        g.globalAlpha=clamp(al2,0,1); g.fillStyle='rgba(18,11,10,.84)'; g.strokeStyle='rgba(255,107,61,.85)'; g.lineWidth=1;
        g.beginPath(); if(g.roundRect)g.roundRect(TMP[0]-tw/2,yy-9,tw,18,9); else g.rect(TMP[0]-tw/2,yy-9,tw,18); g.fill(); g.stroke();
        g.fillStyle='#FFF4EC'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(txt,TMP[0],yy+.5); g.textAlign='start'; g.globalAlpha=1;
      }
    }
    this.pings=keep;
  };

  Globe.prototype.emit=function(x,y,n,burst){
    for(var i=0;i<n;i++){
      var a=Math.random()*6.2832, sp=burst?(.5+Math.random()*1.6):(.08+Math.random()*.35);
      this.parts.push({x:x,y:y,vx:Math.cos(a)*sp*(burst?1:.6),vy:Math.sin(a)*sp-(burst?.35:.45),life:0,max:burst?800+Math.random()*700:650+Math.random()*650,r:.8+Math.random()*1.5});
    }
    if(this.parts.length>260)this.parts.splice(0,this.parts.length-260);
  };
  Globe.prototype.drawParts=function(now){
    var P=this.parts; if(!P.length){this.lt=now;return;}
    var dt=clamp(now-(this.lt||now),0,50), g=this.g, keep=[]; this.lt=now;
    g.globalCompositeOperation='lighter';
    for(var i=0;i<P.length;i++){
      var q=P[i]; q.life+=dt; if(q.life>=q.max)continue; keep.push(q);
      q.x+=q.vx*dt*.06; q.y+=q.vy*dt*.06; q.vx*=.985; q.vy-=.0016*dt;
      var a=1-q.life/q.max;
      g.fillStyle='rgba(255,'+Math.round(110+120*a)+','+Math.round(50+60*a)+','+(a*.9).toFixed(3)+')';
      g.beginPath(); g.arc(q.x,q.y,q.r*(.45+.55*a),0,6.2832); g.fill();
    }
    g.globalCompositeOperation='source-over'; this.parts=keep;
  };

  var heroGlobe=$('heroGlobe')?new Globe($('heroGlobe')):null;
  var reachGlobe=$('reachGlobe')?new Globe($('reachGlobe')):null;
  function sizeGlobes(){if(heroGlobe)heroGlobe.size(); if(reachGlobe)reachGlobe.size();}

  /* ------------------------------------------------------------
     the title sequence (home only)
     ------------------------------------------------------------ */
  var introT0=performance.now(), introOn=false, heroArcBeat=-1;
  var skipIntro=html.classList.contains('skip-intro')||reduce||!isHome;
  function startIntro(){
    if(introOn)return; introOn=true; introT0=performance.now();
    html.classList.add('intro-go');
    var l1=$$('.hero-title .ht-1'), l2=$$('.hero-title .ht-2');
    if(skipIntro){
      l1.concat(l2).forEach(function(e){e.classList.add('in');}); html.classList.add('intro-done');
      $$('.hero-foot [data-count]').forEach(function(el){el.textContent=el.getAttribute('data-final');});
      return;
    }
    setTimeout(function(){l1.forEach(function(e){e.classList.add('in');});},BEAT*1.25);
    setTimeout(function(){l2.forEach(function(e){e.classList.add('in');});},BEAT*2);
    setTimeout(function(){$$('.hero-foot [data-count]').forEach(function(el){countUp(el,1800);});},BEAT*3.6);
    setTimeout(function(){html.classList.add('intro-done'); var lb=doc.querySelector('.letterbox'); if(lb)lb.style.display='none'; layoutDirty=true;},3500);
  }
  (function(){
    if(skipIntro){startIntro();return;}
    var done=false, once=function(){if(!done){done=true; requestAnimationFrame(startIntro);}};
    var link=$('gfont');
    function fontsIn(){
      if(!doc.fonts||!doc.fonts.load){once();return;}
      Promise.all([doc.fonts.load('900 80px "Noto Sans JP"','日本の魅力を世界へ'),doc.fonts.load('400 80px Anton','TAKE JAPAN'),doc.fonts.load('italic 400 80px "Instrument Serif"','world')]).then(once,once);
    }
    if(!link||link.media==='all')fontsIn(); else link.addEventListener('load',function(){setTimeout(fontsIn,0);});
    setTimeout(once,380);
  })();

  /* ------------------------------------------------------------
     count-up
     ------------------------------------------------------------ */
  var tweens=[];
  function fmt(v,dec){return dec?v.toFixed(dec):Math.floor(v).toLocaleString('en-US');}
  function countUp(el,dur){
    var to=parseFloat(el.getAttribute('data-count')), dec=+(el.getAttribute('data-dec')||0), suf=el.getAttribute('data-suf')||'', fin=el.getAttribute('data-final');
    if(reduce||paused){el.textContent=fin;return;}
    tweens.push({t0:performance.now(),dur:dur||1600,fn:function(k){el.textContent=k>=1?fin:fmt(to*easeOutExpo(k),dec)+suf;}});
  }

  /* ------------------------------------------------------------
     reveal on scroll
     ------------------------------------------------------------ */
  var revealTargets=$$('[data-reveal],[data-tiles],.card-id,.final,.why article').concat($$('.sp').filter(function(el){return !el.closest('.hero-title')&&!el.closest('.beat');}));
  if(reduce||!hasIO){revealTargets.forEach(function(el){el.classList.add('in');});}
  else{
    var rio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in'); rio.unobserve(e.target);}});},{rootMargin:'0px 0px -9% 0px',threshold:.1});
    revealTargets.forEach(function(el){rio.observe(el);});
  }

  /* ------------------------------------------------------------
     visibility flags for the loop
     ------------------------------------------------------------ */
  var vis={hero:!!hero&&isHome,reach:false};
  function watch(el,key,margin,cb){
    if(!el)return;
    if(!hasIO){vis[key]=true;return;}
    new IntersectionObserver(function(es){vis[key]=es[0].isIntersecting; if(cb)cb(vis[key]);},{rootMargin:margin||'0px'}).observe(el);
  }
  if(isHome){
    watch(hero,'hero','80px',function(v){html.classList.toggle('hero-off',!v);});
    watch(reachSec,'reach','40px',function(v){if(v&&!countShown){countShown=true; $$('[data-manual]').forEach(function(el){countUp(el,2000);});}});
  }

  /* ------------------------------------------------------------
     videos: muted, looped, playing only while on screen; sound on request
     ------------------------------------------------------------ */
  var videos=[];
  function playV(v){if(!v.getAttribute('src')&&v.dataset.src)v.src=v.dataset.src; var p=v.play(); if(p&&p.catch)p.catch(function(){});}
  function setupVideo(v){
    videos.push(v);
    if(reduce){v.controls=true; v.preload='metadata'; if(v.dataset.src&&!v.getAttribute('src'))v.src=v.dataset.src; return;}
    v._vis=false;
  }
  function soundButtonFor(v){var box=v.closest('.vp-frame'); return box?box.querySelector('.vp-sound'):null;}
  // only one video speaks at a time
  function muteAll(except){
    videos.forEach(function(o){if(o!==except&&!o.muted){o.muted=true; var b=soundButtonFor(o); if(b)b.setAttribute('aria-pressed','false');}});
  }
  function bindSound(btn){
    var box=btn.closest('.vp-frame'), v=box&&box.querySelector('video'); if(!v)return;
    if(reduce){btn.hidden=true; return;}
    btn.addEventListener('click',function(){
      var on=v.muted; v.muted=!on; btn.setAttribute('aria-pressed',String(on));
      if(on){muteAll(v); playV(v);}
    });
  }
  $$('video').forEach(setupVideo);
  $$('.vp-sound').forEach(bindSound);
  if(hasIO&&!reduce){
    var vio=new IntersectionObserver(function(es){es.forEach(function(e){
      var v=e.target; v._vis=e.isIntersecting;
      if(e.isIntersecting&&!paused)playV(v);
      else{v.pause(); if(!v.muted){v.muted=true; var b=soundButtonFor(v); if(b)b.setAttribute('aria-pressed','false');}}
    });},{rootMargin:'80px 0px',threshold:.15});
    videos.forEach(function(v){vio.observe(v);});
  }

  /* ------------------------------------------------------------
     the SNS monitor: animates only while on screen
     ------------------------------------------------------------ */
  var mons=$$('[data-mon]');
  function setLive(m,on){m.classList.toggle('live',on&&!paused);}
  if(!reduce&&hasIO){
    var mio=new IntersectionObserver(function(es){es.forEach(function(e){e.target._in=e.isIntersecting; setLive(e.target,e.isIntersecting);});},{threshold:.22});
    mons.forEach(function(m){mio.observe(m);});
  }

  /* ------------------------------------------------------------
     reach: the globe plays by itself. A world tour heading east; each scene
     lasts 10 beats, the camera never stops (a slow drift, then a glide to the next view)
     ------------------------------------------------------------ */
  var beats=$$('.beat'), ticks=$$('#beatTicks button'), bnNow=$('bnNow'), hudTxt=$('hudTxt'), reachTc=$('reachTc');
  var HUDTXT=['TOKYO, JAPAN','TOKYO → LOS ANGELES','TOKYO → WORLD','SHIPPING → WORLD','WORLD → TOKYO'];
  var TOUR=[{lon:128,lat:32,z:1.32},{lon:182,lat:26,z:1.02},{lon:241,lat:22,z:.95},{lon:325,lat:26,z:1.0},{lon:434,lat:30,z:1.12}];
  var SCENE_MS=BEAT*10, GLIDE_MS=1700, DRIFT=3/1000;
  var scene=-1, sceneEl=0, cycle=0, from=null, countShown=false, lastAmb=0, outIdx=0;
  var camNow={lon:TOUR[0].lon,lat:TOUR[0].lat,z:TOUR[0].z};
  function tourBase(k){var b=TOUR[k]; return {lon:b.lon+360*cycle,lat:b.lat,z:b.z};}
  function setScene(k,now,manual){
    var prev=scene; scene=k; sceneEl=0;
    from=prev<0?null:{lon:camNow.lon,lat:camNow.lat,z:camNow.z};
    beats.forEach(function(el,i){
      if(i===k){el.classList.remove('out'); el.classList.add('on');}
      else if(i===prev){el.classList.remove('on'); el.classList.add('out'); (function(e){setTimeout(function(){if(!e.classList.contains('on'))e.classList.remove('out');},700);})(el);}
      else el.classList.remove('on','out');
    });
    ticks.forEach(function(t,i){t.classList.toggle('done',i<k); var bar=t.querySelector('i'); if(bar&&i>=k)bar.style.transform=''; if(i===k)t.setAttribute('aria-current','step'); else t.removeAttribute('aria-current');});
    if(bnNow)bnNow.textContent=String(k+1); if(hudTxt)hudTxt.textContent=HUDTXT[k]; if(reachTc)reachTc.textContent='SC 0'+(k+1)+'/05';
    lastAmb=now; launchScene(k,now);
  }
  var TAGK=[0,1,2,3];
  function launchScene(k,now){
    if(!reachGlobe)return;
    var G=reachGlobe; G.arcs=G.arcs.filter(function(a){return now-a.t0<a.dur+a.hold&&now>=a.t0;});
    if(k===1){G.arc(TOKYO,CITY.LAX.v,{t0:now+250,dur:2600,w:2.4,hold:2400,city:CITY.LAX,label:true});}
    if(k===2){pick(inLon(-160,-40).concat([CITY.SYD,CITY.AKL,CITY.HNL,CITY.BNE,CITY.GUM]),22).forEach(function(c,i){G.arc(TOKYO,c.v,{t0:now+i*BEAT/3,dur:1500+rnd()*700,w:1.3,hold:1600,city:c,label:i%3===0,tag:i%2===0?TAGK[i/2%4|0]:null});});}
    if(k===3){pick(inLon(-80,40),18).forEach(function(c,i){G.arc(TOKYO,c.v,{t0:now+i*BEAT*.4,dur:2300+rnd()*600,kind:'ship',w:1.2,h:.06,hold:900,city:c,label:i%4===0});});}
    if(k===4){pick(inLon(-10,125),22).forEach(function(c,i){G.arc(c.v,TOKYO,{t0:now+i*BEAT*.3,dur:1900+rnd()*600,kind:'in',w:1.1,hold:700,h:.12});});}
  }
  function ambient(now){
    if(!reachGlobe||now-lastAmb<BEAT)return; lastAmb=now; var G=reachGlobe, c;
    if(scene===1&&sceneEl>3200){G.arc(TOKYO,CITY.SFO.v,{t0:now,dur:2200,w:1.4,hold:1400,city:CITY.SFO});}
    if(scene===2){var A=inLon(-160,-40); c=A[(outIdx++*7)%A.length]; G.arc(TOKYO,c.v,{t0:now,dur:1700,w:1.2,hold:1400,city:c,tag:outIdx%2?(outIdx%4):null});}
    if(scene===3){var B=inLon(-80,40); c=B[(outIdx++*5)%B.length]; G.arc(TOKYO,c.v,{t0:now,dur:2400,kind:'ship',w:1.1,h:.06,hold:800,city:c});}
    if(scene===4){var C=inLon(-10,125); c=C[(outIdx++*11)%C.length]; G.arc(c.v,TOKYO,{t0:now,dur:2000,kind:'in',w:1,hold:600,h:.12});}
  }
  ticks.forEach(function(t){t.addEventListener('click',function(){
    var k=+t.getAttribute('data-scene'); if(k<scene)cycle++; setScene(k,performance.now(),true);
  });});
  function renderReach(now,dt,draw){
    if(!reachGlobe||!reachGlobe.W)return;
    if(scene<0)setScene(0,now);
    sceneEl+=dt;
    if(sceneEl>=SCENE_MS){var nk=(scene+1)%5; if(nk===0)cycle++; setScene(nk,now);}
    var b=tourBase(scene), drift=DRIFT*sceneEl;
    if(from&&sceneEl<GLIDE_MS){
      var e=easeIO(sceneEl/GLIDE_MS), hop=Math.min(1,Math.abs(b.lon-from.lon)/120)*.16*Math.sin(Math.PI*e);
      camNow={lon:lerp(from.lon,b.lon,e)+drift,lat:lerp(from.lat,b.lat,e),z:Math.exp(lerp(Math.log(from.z),Math.log(b.z),e))*(1-hop)};
    } else camNow={lon:b.lon+drift,lat:b.lat,z:b.z};
    var bar=ticks[scene]&&ticks[scene].querySelector('i'); if(bar)bar.style.transform='scaleX('+clamp(sceneEl/SCENE_MS,0,1).toFixed(4)+')';
    var G=reachGlobe, W=G.W, H=G.H, narrow=W<760;
    var R0=narrow?W*.6:Math.min(W*.34,H*.46);
    G.setCam(camNow.lon,camNow.lat,R0*camNow.z,narrow?W*.5:W*.64,narrow?H*.64:H*.56);
    ambient(now);
    if(draw)G.draw(now,{jp:scene===0?1:.8,fast:!G.glr});
  }

  /* hero globe: a slow, swinging camera; an arc leaves Tokyo on every second beat */
  var HERO_DEST=CITIES.filter(function(c){return c.lon>25||c.lon<-55;});
  var heroIdx=0;
  function renderHero(now){
    var G=heroGlobe; if(!G||!G.W||!introOn)return;
    var t=Math.max(0,now-introT0), R=Math.min(G.W,G.H)*.41;
    G.setCam(146+20*Math.sin(t/9000),24+4*Math.sin(t/13000+1),R,G.W/2,G.H/2);
    if(!G.seeded&&t>BEAT){G.seeded=1; pick(HERO_DEST,9).forEach(function(c,i){G.arc(TOKYO,c.v,{t0:now+i*BEAT*.3,dur:BEAT*(3.5+i%3*.5),w:1.2,hold:BEAT*6,city:c});});}
    var b=Math.floor((t-BEAT*3)/BEAT), n=HERO_DEST.length;
    if(b>heroArcBeat&&t>BEAT*3){heroArcBeat=b;
      var c=HERO_DEST[(heroIdx++*7)%n]; G.arc(TOKYO,c.v,{t0:now,dur:BEAT*(3.5+heroIdx%3*.5),w:heroIdx%4===0?1.7:1.3,hold:BEAT*6,city:c});
      {var d=HERO_DEST[(heroIdx*11+3)%n]; G.arc(TOKYO,d.v,{t0:now+BEAT*.5,dur:BEAT*4.5,w:1.1,hold:BEAT*5,city:d});}
      if(b%4===1){var e=HERO_DEST[(heroIdx*13+5)%n]; G.arc(e.v,TOKYO,{t0:now+BEAT*.25,dur:BEAT*4,kind:'in',w:1,hold:BEAT*2,h:.1});}
    }
    G.draw(now,{beat:((t/BEAT)%2)/2,fast:!G.glr});
  }

  /* ------------------------------------------------------------
     statement: the voice-over lights up word by word
     ------------------------------------------------------------ */
  var fills=$$('.fill');
  fills.forEach(function(el){
    var chars=[], isEn=el.classList.contains('en');
    (function walk(node){
      [].slice.call(node.childNodes).forEach(function(n){
        if(n.nodeType===3){
          var parts=isEn?n.textContent.split(/(\s+)/):Array.from(n.textContent), frag=doc.createDocumentFragment();
          parts.forEach(function(t){
            if(!t)return;
            if(/^\s+$/.test(t)){frag.appendChild(doc.createTextNode(t));return;}
            var s=doc.createElement('span'); s.className='fc'; s.textContent=t; frag.appendChild(s); chars.push(s);
          });
          n.parentNode.replaceChild(frag,n);
        } else if(n.nodeType===1)walk(n);
      });
    })(el);
    el._chars=chars; el._lit=-2;
    el._keys=$$('.key',el).map(function(k){var c=k.querySelectorAll('.fc'); return {el:k,last:chars.indexOf(c[c.length-1])};});
  });
  function measureFills(){fills.forEach(function(el){el._top=el.offsetParent?top(el):-1; el._h=el.offsetHeight;});}
  function updateFill(sy){
    fills.forEach(function(el){
      if(el._top<0||el._top==null)return;
      var rt=el._top-sy, n=el._chars.length;
      if(rt+el._h<-vh||rt>vh*2)return;
      var lit=reduce?n-1:Math.round(clamp((vh*.82-rt)/(el._h+vh*.25),0,1)*n)-1;
      if(lit===el._lit)return;
      for(var i=0;i<n;i++){var on=i<=lit; if(el._chars[i]._on!==on){el._chars[i]._on=on; el._chars[i].classList.toggle('on',on);}}
      el._keys.forEach(function(k){k.el.classList.toggle('on',lit>=k.last);});
      el._lit=lit;
    });
  }

  /* ------------------------------------------------------------
     HUD: section label, reel timecode, Tokyo clock, progress rail
     ------------------------------------------------------------ */
  var SECS=$$('[data-hud]').map(function(el,i){return {el:el,no:(i+1<10?'0':'')+(i+1),name:el.getAttribute('data-hud')};});
  var hudNo=$('hudNo'), hudName=$('hudName'), hudBar=$('hudBar'), hudTc=$('hudTc'), hudClock=$('hudClock'), recTc=$('recTc'), hudFrame=doc.querySelector('.hud-frame');
  var hudCur=-1, hudLight=null, hudLightTop=null, CH='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.';
  function scramble(el,txt){
    if(reduce){el.textContent=txt;return;}
    var t0=performance.now(), n=Math.max(el.textContent.length,txt.length);
    (function f(now){var k=Math.min(1,(now-t0)/460), out='';
      for(var i=0;i<n;i++){var done=i<txt.length&&k*n*1.15>i+1; out+=done?txt[i]:(i<txt.length||k<.6?CH[Math.floor(Math.random()*CH.length)]:'');}
      el.textContent=k<1?out.slice(0,Math.max(txt.length,Math.round(n*(1-k)))):txt; if(k<1)requestAnimationFrame(f);})(t0);
  }
  function measureHud(){
    var a=doc.querySelector('.hud-frame .l-sec'), b=$('hudTky'); if(!a||!b)return;
    hudFrame.style.setProperty('--secw',(a.getBoundingClientRect().width+18)+'px'); hudFrame.style.setProperty('--tkyw',(b.getBoundingClientRect().width+18)+'px');
  }
  function onLight(y){for(var j=0;j<L.tones.length;j++){if(y>=L.tones[j][0]&&y<=L.tones[j][1])return true;} return false;}
  function tc(sec){var f=Math.floor(sec*24), p=function(x){return (x<10?'0':'')+x;}; return p(Math.floor(f/86400))+':'+p(Math.floor(f/1440)%60)+':'+p(Math.floor(f/24)%60)+':'+p(f%24);}
  function updateHud(sy){
    if(!hudNo)return;
    var mid=sy+vh*.45, k=0;
    for(var i=0;i<SECS.length;i++){if(L.secs[i]<=mid)k=i;}
    if(k!==hudCur&&SECS[k]){hudCur=k; scramble(hudNo,SECS[k].no); scramble(hudName,SECS[k].name); setTimeout(measureHud,480);}
    var p=clamp(sy/docH,0,1);
    hudBar.style.transform='scaleX('+p.toFixed(4)+')';
    hudTc.textContent=tc(p*150);
    var light=onLight(sy+vh-28), lightTop=onLight(sy+92);
    if(light!==hudLight){hudLight=light; html.classList.toggle('hud-light',light);}
    if(lightTop!==hudLightTop){hudLightTop=lightTop; html.classList.toggle('hud-light-top',lightTop);}
  }
  function clockTick(){
    if(!hudClock)return;
    var d=new Date(Date.now()+(9*60+new Date().getTimezoneOffset())*60000), p=function(x){return (x<10?'0':'')+x;};
    hudClock.textContent=p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
  }
  clockTick(); setInterval(clockTick,1000);

  /* ------------------------------------------------------------
     the loop
     ------------------------------------------------------------ */
  var lastT=0, lastSy=-1, layoutDirty=true, navHidden=false, navSolid=null, lastRec=0;
  /* if a slow device cannot hold ~40 fps while a globe turns, draw the globes every other frame,
     then at device-pixel ratio 1. The rest of the page keeps its full frame rate. */
  var perfLvl=0, perfEma=16.7, perfN=0, frameNo=0;
  function perfWatch(dt){
    perfEma+=(dt-perfEma)*.06; perfN++;
    if(perfN>100&&perfEma>27&&perfLvl<2){perfLvl++; perfN=0; perfEma=16.7; if(perfLvl===2){maxDpr=1; sizeGlobes();}}
  }
  function loop(now){
    requestAnimationFrame(loop);
    var dt=lastT?Math.min(64,now-lastT):16; lastT=now;
    if(lenis)lenis.raf(now);
    var sy=window.pageYOffset||html.scrollTop||0;
    var dy=lastSy<0?0:sy-lastSy, moved=dy!==0||layoutDirty;
    if(tweens.length){tweens=tweens.filter(function(tw){var k=clamp((now-tw.t0)/tw.dur,0,1); tw.fn(k); return k<1;});}
    if(moved){
      if(isHome&&!reduce&&sy<L.heroH*1.1){
        var hp=clamp(sy/(L.heroH*.85),0,1), he=hp*hp;
        heroIn.style.transform='translate3d(0,'+(-hp*90).toFixed(1)+'px,0) scale('+(1+he*.14).toFixed(4)+')';
        heroIn.style.opacity=(1-clamp(hp*1.35,0,1)).toFixed(3);
        dial.style.transform='translate3d(0,'+(hp*-40).toFixed(1)+'px,0) scale('+(1+he*.75).toFixed(4)+')';
        dial.style.opacity=(1-clamp(hp*1.1,0,1)).toFixed(3);
        if(html.classList.contains('intro-done')){heroFoot.style.transform='translate3d(0,'+(-hp*40).toFixed(1)+'px,0)'; heroFoot.style.opacity=(1-clamp(hp*1.8,0,1)).toFixed(3);}
      }
      if(!reduce)for(var f=0;f<flowLists.length;f++){var F=L.flows[f]; if(F){var fp=clamp((sy+vh*.72-F[0])/Math.max(1,F[1]),0,1); flowLists[f].style.setProperty('--fp',fp.toFixed(4));}}
      updateFill(sy); updateHud(sy);
      var solid=sy>40; if(solid!==navSolid){navSolid=solid; nav.classList.toggle('solid',solid);}
      if(!reduce&&!menuOpen){var hide=sy>vh*.9&&dy>3&&!nav.contains(doc.activeElement); if(dy<-3||sy<vh*.5)hide=false; if(hide!==navHidden&&(dy>3||dy<-3||sy<vh*.5)){navHidden=hide; nav.classList.toggle('hide',hide);}}
      layoutDirty=false;
    }
    lastSy=sy;
    var heroOn=vis.hero&&!paused&&introOn&&!reduce, reachOn=vis.reach&&!paused&&!reduce;
    if(heroOn||reachOn){perfWatch(dt); frameNo++;}
    var drawNow=perfLvl===0||(frameNo&1)===0;
    if(heroOn){if(drawNow)renderHero(now); if(recTc&&now-lastRec>80){lastRec=now; recTc.textContent=tc((now-introT0)/1000);}}
    if(reachOn)renderReach(now,dt,drawNow);
  }

  /* ------------------------------------------------------------
     scrolling helpers + anchors (also "/#contact" when already on that page)
     ------------------------------------------------------------ */
  function scrollToY(y){
    if(lenis){lenis.scrollTo(y,{duration:1.6,easing:function(t){return t>=1?1:1-Math.pow(2,-10*t);}});}
    else window.scrollTo({top:y,behavior:reduce?'auto':'smooth'});
  }
  var mainEl=$('main'); if(mainEl)mainEl.setAttribute('tabindex','-1');
  nav.addEventListener('focusin',function(){if(navHidden){navHidden=false; nav.classList.remove('hide');}});
  function samePage(a){
    var p=a.pathname.replace(/\/$/,'')||'/', here=location.pathname.replace(/\/$/,'')||'/';
    return a.host===location.host&&p===here&&a.hash.length>1;
  }
  doc.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href]');
    if(!a||e.metaKey||e.ctrlKey||e.shiftKey||a.target==='_blank')return;
    if(!samePage(a))return;
    var id=decodeURIComponent(a.hash.slice(1)), el=$(id); if(!el)return;
    e.preventDefault();
    if(menuOpen)closeMenu(false);
    var y=id==='top'?0:Math.max(0,el.getBoundingClientRect().top+window.pageYOffset-(id==='main'?0:64));
    scrollToY(y);
    if(id==='main'||a.classList.contains('skip')||a.classList.contains('to-top'))el.focus({preventScroll:true});
    try{history.pushState(null,'','#'+id);}catch(err){}
  });

  /* ------------------------------------------------------------
     menu (phones and tablets)
     ------------------------------------------------------------ */
  var menu=$('menu'), menuBtn=$('menuBtn'), menuOpen=false, menuT=0;
  function openMenu(){
    if(!menu)return; clearTimeout(menuT); menuOpen=true; menu.hidden=false; void menu.offsetWidth;
    menu.classList.add('open'); html.classList.add('menu-open'); menuBtn.setAttribute('aria-expanded','true');
    nav.classList.remove('hide'); navHidden=false; if(lenis)lenis.stop();
    var first=menu.querySelector('a'); if(first)setTimeout(function(){first.focus({preventScroll:true});},reduce?0:320);
  }
  function closeMenu(refocus){
    if(!menu||!menuOpen)return; menuOpen=false;
    menu.classList.remove('open'); html.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded','false'); if(lenis)lenis.start();
    menuT=setTimeout(function(){if(!menuOpen)menu.hidden=true;},reduce?0:760);
    if(refocus!==false)menuBtn.focus({preventScroll:true});
  }
  if(menuBtn)menuBtn.addEventListener('click',function(){if(menuOpen)closeMenu(); else openMenu();});
  doc.addEventListener('keydown',function(e){
    if(!menuOpen)return;
    if(e.key==='Escape'){e.preventDefault(); closeMenu();}
    if(e.key==='Tab'){ // keep focus inside the open menu (and its button)
      var f=[menuBtn].concat($$('a,button',menu)).filter(function(x){return x.offsetParent!==null;}), i=f.indexOf(doc.activeElement);
      if(e.shiftKey&&i<=0){e.preventDefault(); f[f.length-1].focus();}
      else if(!e.shiftKey&&i===f.length-1){e.preventDefault(); f[0].focus();}
    }
  });
  window.addEventListener('resize',function(){if(menuOpen&&window.innerWidth>1180)closeMenu(false);});

  /* ------------------------------------------------------------
     motion toggle (header button and the one in the menu)
     ------------------------------------------------------------ */
  var mBtns=$$('[data-motion]');
  function applyPaused(){
    html.classList.toggle('paused',paused);
    mBtns.forEach(function(b){
      b.setAttribute('aria-pressed',String(paused));
      var lbl=b.classList.contains('motion-txt')?b:b.querySelector('.sr');
      if(lbl)lbl.innerHTML=paused?'<span class="ja">動きを再開</span><span class="en">Play motion</span>':'<span class="ja">動きを止める</span><span class="en">Pause motion</span>';
    });
    mons.forEach(function(m){setLive(m,!!m._in);});
    videos.forEach(function(v){if(paused)v.pause(); else if(v._vis)playV(v);});
  }
  mBtns.forEach(function(b){
    if(reduce){b.hidden=true; return;}
    b.addEventListener('click',function(){paused=!paused; try{localStorage.setItem('ato-motion',paused?'off':'on');}catch(e){} applyPaused();});
  });
  applyPaused();

  /* ------------------------------------------------------------
     contact form → /apply (JSON; same fields as before)
     ------------------------------------------------------------ */
  (function(){
    var form=$('applyForm'), st=$('formStatus'), sub=$('submitBtn'); if(!form)return;
    var MSG={
      ja:{need:'お名前・会社名・メールアドレス・「ご相談したいこと」を入力してください。',mail:'メールアドレスの形式を確認してください。',sending:'送信中…',
          ok:'送信しました！内容を確認して、メールでご連絡します。少しだけお待ちください。',
          err:'送信できませんでした。お手数ですが、公式LINEからご連絡ください。',dm:'公式LINEで相談する →'},
      en:{need:'Please fill in your name, company, email and what we can help with.',mail:'Please check your email address.',sending:'Sending…',
          ok:'Sent! We will get back to you by email soon.',
          err:'We could not send your request. Please message us on LINE instead.',dm:'Message us on LINE →'}
    };
    function show(kind,text,withLink){
      st.hidden=false; st.className='status '+kind; st.textContent='';
      var p=doc.createElement('span'); p.textContent=text; st.appendChild(p);
      if(withLink){var a=doc.createElement('a'); a.href='https://lin.ee/qmngoTF'; a.target='_blank'; a.rel='noopener'; a.textContent=MSG[lang].dm; st.appendChild(a);}
    }
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var m=MSG[lang], name=$('f-name').value.trim(), company=$('f-company').value.trim(), email=$('f-email').value.trim();
      var types=$$('input[name="type"]:checked',form).map(function(x){return x.value;});
      if(!name||!company||!email||!types.length){show('err',m.need);return;}
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){show('err',m.mail); $('f-email').focus(); return;}
      if($('f-bot').checked)return;
      sub.disabled=true; show('ok',m.sending);
      var payload={name:name,company:company,department:$('f-dept').value.trim(),email:email,account:$('f-account').value.trim(),type:types.join('、'),message:$('f-msg').value.trim(),lang:lang};
      fetch('/apply',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)})
        .then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error('failed');});})
        .then(function(){show('ok',m.ok); form.reset();},function(){show('err',m.err,true);})
        .then(function(){sub.disabled=false;});
    });
  })();

  /* ------------------------------------------------------------
     boot
     ------------------------------------------------------------ */
  measure();
  window.addEventListener('resize',function(){if(isTouch&&window.innerWidth===vw){vh=window.innerHeight; docH=Math.max(1,html.scrollHeight-vh); return;} relayoutSoon();});
  try{new ResizeObserver(relayoutSoon).observe(body);}catch(e){}
  if(doc.fonts&&doc.fonts.ready)doc.fonts.ready.then(relayoutSoon);
  window.addEventListener('load',relayoutSoon);
  html.classList.add('ready');
  if(reduce){
    // one calm, complete frame of each globe
    var drawStatic=function(){
      if(heroGlobe&&heroGlobe.size()){var R=Math.min(heroGlobe.W,heroGlobe.H)*.41; heroGlobe.setCam(146,24,R,heroGlobe.W/2,heroGlobe.H/2); heroGlobe.draw(performance.now(),{beat:.3});}
      if(reachGlobe&&reachGlobe.size()){var G=reachGlobe, R2=Math.min(G.W*.46,G.H*.46), n2=performance.now(); G.setCam(150,28,R2,G.W/2,G.H/2); G.arcs=[]; G.pings=[];
        pick(CITIES,12).forEach(function(c){G.arc(TOKYO,c.v,{t0:n2-5000,dur:1000,w:1.2,hold:1e9,city:c});}); G.draw(n2,{jp:1}); G.pings=[]; G.draw(n2,{jp:1});}
    };
    setTimeout(drawStatic,60); window.addEventListener('load',drawStatic); window.addEventListener('resize',function(){setTimeout(drawStatic,200);});
    beats.forEach(function(b){b.classList.add('on');});
  }
  requestAnimationFrame(loop);
})();

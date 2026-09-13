// Pure geometry and bounded image operations, shared by the worker and tests.
const CoverGeometry = (() => {
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const area=p=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-a[1]*b[0];},0))/2;
  function valid(points){
    return Array.isArray(points)&&points.length===4&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1))&&
      points.every((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4])>0.0001&&distance(p,points[(i+1)%4])>=0.025)&&area(points)>=0.008;
  }
  function hull(points){
    const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lower=[],upper=[];
    for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  }
  function quad(polygon){
    const p=polygon.slice();
    // Remove nearly collinear hull vertices first, retaining dominant corners.
    while(p.length>4){let best=Infinity,index=0;for(let i=0;i<p.length;i++){const cost=Math.abs(cross(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length]));if(cost<best){best=cost;index=i;}}p.splice(index,1);}
    if(p.length!==4)return null;
    let first=0;for(let i=1;i<4;i++)if(p[i][0]+p[i][1]<p[first][0]+p[first][1])first=i;
    return p.slice(first).concat(p.slice(0,first));
  }
  function detect(data,width,height){
    if(width<24||height<24||width*height>800*800) return {points:null};
    const size=width*height,gray=new Uint8Array(size),strength=new Uint16Array(size),hist=new Uint32Array(2041);
    for(let i=0;i<size;i++)gray[i]=(data[i*4]*77+data[i*4+1]*150+data[i*4+2]*29)>>8;
    let count=0;
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x;
      const gx=-gray[i-width-1]+gray[i-width+1]-2*gray[i-1]+2*gray[i+1]-gray[i+width-1]+gray[i+width+1];
      const gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1];
      const value=Math.abs(gx)+Math.abs(gy);strength[i]=value;if(value>20){hist[value]++;count++;}
    }
    if(count<size*.002)return {points:null};
    let threshold=40,cumulative=0;
    for(let i=20;i<hist.length;i++){cumulative+=hist[i];if(cumulative>=count*.70){threshold=Math.max(40,i);break;}}
    const mask=new Uint8Array(size),queue=new Int32Array(size);
    // A one-pixel dilation closes small gaps without merging distant outlines.
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++)if(strength[y*width+x]>=threshold){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)mask[(y+dy)*width+x+dx]=1;}
    const candidates=[];
    for(let seed=0;seed<size;seed++){
      if(!mask[seed])continue;
      let head=0,tail=1;queue[0]=seed;mask[seed]=0;const edges=[];
      while(head<tail){
        const i=queue[head++],x=i%width,y=Math.floor(i/width);
        if(strength[i]>=threshold)edges.push([x,y]);
        for(const n of [i-1,i+1,i-width,i+width])if(n>=0&&n<size&&mask[n]&&Math.abs(n%width-x)<=1){mask[n]=0;queue[tail++]=n;}
      }
      if(edges.length<Math.min(width,height)*.6)continue;
      // Bound hull sorting work on textured photographs.
      const stride=Math.max(1,Math.floor(edges.length/12000));
      const outline=hull(edges.filter((_,i)=>i%stride===0)),corners=quad(outline);if(!corners)continue;
      const fraction=area(corners)/size,fit=area(corners)/Math.max(1,area(outline));
      if(fraction<.12||fraction>.94||fit<.92)continue;
      const normalized=corners.map(([x,y])=>[x/(width-1),y/(height-1)]);
      if(!valid(normalized)||corners.some(([x,y])=>x<3||y<3||x>width-4||y>height-4))continue;
      let support=0,total=0;
      for(let i=0;i<4;i++){
        const a=corners[i],b=corners[(i+1)%4];
        for(let k=0;k<=40;k++){
          const x=Math.round(a[0]+(b[0]-a[0])*k/40),y=Math.round(a[1]+(b[1]-a[1])*k/40);let max=0;
          for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height)max=Math.max(max,strength[ny*width+nx]);}
          total++;if(max>=threshold)support++;
        }
      }
      if(support/total<.80)continue;
      candidates.push({points:normalized,score:fraction*fit*(support/total)});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const best=candidates[0];
    // Two similarly sized objects need a user's choice, not an automatic crop.
    if(!best||(candidates[1]&&candidates[1].score>best.score*.8))return {points:null};
    return {points:best.points};
  }
  function dimensions(points,width,height,ratio){
    if(!valid(points))throw new Error('四隅が交差しているか、範囲が小さすぎます。表紙の周囲に調整してください。');
    const p=points.map(([x,y])=>[x*(width-1),y*(height-1)]);
    const w=(distance(p[0],p[1])+distance(p[3],p[2]))/2,h=(distance(p[0],p[3])+distance(p[1],p[2]))/2;
    const r=ratio==null?w/h:ratio;
    if(!Number.isFinite(r)||r<.2||r>5)throw new Error('横÷縦の比率を0.2〜5の範囲で指定してください。');
    // No enlargement relative to either estimated source side; max long edge 2000.
    const outH=Math.min(h,w/r,2000,2000/r),outW=outH*r;
    if(Math.min(outW,outH)<8)throw new Error('選択範囲が小さすぎます。');
    return {width:Math.round(outW),height:Math.round(outH),ratio:r};
  }
  function transform(points){
    const [a,b,c,d]=points,dx1=b[0]-c[0],dx2=d[0]-c[0],dy1=b[1]-c[1],dy2=d[1]-c[1];
    const sx=a[0]-b[0]+c[0]-d[0],sy=a[1]-b[1]+c[1]-d[1],den=dx1*dy2-dx2*dy1;
    if(Math.abs(den)<1e-12)throw new Error('この四隅では補正できません。');
    const g=(sx*dy2-dx2*sy)/den,h=(dx1*sy-sx*dy1)/den;
    return [b[0]-a[0]+g*b[0],d[0]-a[0]+h*d[0],a[0],b[1]-a[1]+g*b[1],d[1]-a[1]+h*d[1],a[1],g,h];
  }
  function warp(data,width,height,points,ratio){
    const output=dimensions(points,width,height,ratio),m=transform(points),pixels=new Uint8ClampedArray(output.width*output.height*4);
    for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
      const u=x/(output.width-1),v=y/(output.height-1),den=m[6]*u+m[7]*v+1;
      const sx=Math.min(width-1,Math.max(0,(m[0]*u+m[1]*v+m[2])/den*(width-1)));
      const sy=Math.min(height-1,Math.max(0,(m[3]*u+m[4]*v+m[5])/den*(height-1)));
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,width-1),y1=Math.min(y0+1,height-1),fx=sx-x0,fy=sy-y0;
      const target=(y*output.width+x)*4;
      for(let ch=0;ch<3;ch++)pixels[target+ch]=(data[(y0*width+x0)*4+ch]*(1-fx)+data[(y0*width+x1)*4+ch]*fx)*(1-fy)+(data[(y1*width+x0)*4+ch]*(1-fx)+data[(y1*width+x1)*4+ch]*fx)*fy;
      pixels[target+3]=255;
    }
    return {...output,data:pixels};
  }
  return {detect,valid,dimensions,transform,warp};
})();

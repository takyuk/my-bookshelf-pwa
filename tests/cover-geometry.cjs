const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
module.exports=()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/cover-geometry.js'),'utf8'),context);
  const geometry=vm.runInContext('CoverGeometry',context);
  const box=[[.15,.12],[.85,.18],[.78,.9],[.2,.85]];
  const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  function photograph(points){const width=240,height=320,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const inside=points.every((a,i)=>cross(a,points[(i+1)%4],[x/(width-1),y/(height-1)])>=0),i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=inside?220:25;data[i+3]=255;}return {width,height,data};}
  const sample=photograph(box),detected=geometry.detect(sample.data,sample.width,sample.height).points;
  assert.ok(detected,'Detect a tilted, high-contrast cover');
  detected.forEach((p,i)=>{assert.ok(Math.hypot(p[0]-box[i][0],p[1]-box[i][1])<.04);});
  assert.equal(geometry.detect(new Uint8ClampedArray(240*320*4),240,320).points,null);
  assert.equal(geometry.valid([[0,0],[1,1],[1,0],[0,1]]),false);
  assert.equal(geometry.valid([[0,0],[1,0],[1,0],[0,1]]),false);
  assert.equal(geometry.valid([[NaN,0],[1,0],[1,1],[0,1]]),false);
  assert.throws(()=>geometry.dimensions(box,100,100,0));
  const size=geometry.dimensions(box,6000,8000,.67);assert.ok(Math.max(size.width,size.height)<=2000);assert.ok(Math.abs(size.width/size.height-.67)<.001);
  const m=geometry.transform(box);
  [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const den=m[6]*u+m[7]*v+1;assert.ok(Math.abs((m[0]*u+m[1]*v+m[2])/den-box[i][0])<1e-9);assert.ok(Math.abs((m[3]*u+m[4]*v+m[5])/den-box[i][1])<1e-9);});
  const pixels=Uint8ClampedArray.from({length:12*16*4},(_,i)=>i%4===3?255:i%251);
  const warped=geometry.warp(pixels,12,16,[[0,0],[1,0],[1,1],[0,1]]);
  assert.deepEqual(Array.from(warped.data.slice(0,4)),Array.from(pixels.slice(0,4)));
  assert.deepEqual(Array.from(warped.data.slice(-4)),Array.from(pixels.slice(-4)));
  const cropped=geometry.warp(sample.data,sample.width,sample.height,box);
  const mid=((Math.floor(cropped.height/2)*cropped.width)+Math.floor(cropped.width/2))*4;
  assert.equal(cropped.data[mid],220);
  console.log('PASS: cover boundary detection, blank-image fallback, invalid quadrilaterals, aspect ratio and perspective mapping');
};

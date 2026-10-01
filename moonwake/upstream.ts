/* Adapter over the original Mapgen4 algorithms. Upstream copyrights remain intact. */
import Delaunator from 'delaunator';
import {choosePoints} from '../generate-points.ts';
import {TriangleMesh} from '../dual-mesh/index.ts';
import Mapgen from '../map.ts';
import type {Mesh} from '../types.d.ts';

export function generateMacro(seed:number, wetness:number) {
  const spacing=11, data=choosePoints(seed,spacing,70);
  const mesh=new TriangleMesh(TriangleMesh.addGhostStructure({points:data.points,delaunator:Delaunator.from(data.points) as any,numBoundaryPoints:data.numExteriorBoundaryPoints})) as Mesh;
  mesh.is_boundary_t=new Int8Array(mesh.numTriangles);
  mesh.length_s=new Float32Array(mesh.numSides);
  for(let t=0;t<mesh.numTriangles;t++) mesh.is_boundary_t[t]=mesh.r_around_t(t).some(r=>mesh.is_boundary_r(r))?1:0;
  for(let s=0;s<mesh.numSides;s++) mesh.length_s[s]=Math.hypot(mesh.x_of_r(mesh.r_begin_s(s))-mesh.x_of_r(mesh.r_end_s(s)),mesh.y_of_r(mesh.r_begin_s(s))-mesh.y_of_r(mesh.r_end_s(s)));
  const peaks=Array.from({length:data.numMountainPoints},(_,i)=>mesh.t_inner_s(mesh._s_of_r[i+data.numExteriorBoundaryPoints+data.numInteriorBoundaryPoints]));
  const map=new Mapgen(mesh,peaks,{spacing});
  const n=128, constraints=new Float32Array(n*n);
  for(let z=0;z<n;z++) for(let x=0;x<n;x++) {
    const nx=2*x/(n-1)-1,nz=2*z/(n-1)-1,r=Math.hypot(nx,nz);
    constraints[z*n+x]=r>0.94?-0.3:0.2+0.55*Math.min(1,r)+0.16*Math.max(0,-nz);
  }
  map.assignElevation({seed,noisy_coastlines:0.015,mountain_sharpness:10,hill_height:0.055,mountain_jagged:0.3,ocean_depth:1.4},{size:n,constraints});
  map.assignRainfall({wind_angle_deg:25,raininess:0.4+wetness,rain_shadow:0.6,evaporation:0.6});
  map.assignRivers({flow:0.25});
  map.assignRegionElevation();
  // Rasterize the actual dual-mesh outputs into an interpolated macro field.
  const size=129, height=new Float32Array(size*size), rain=new Float32Array(size*size), drainage=new Float32Array(size*size);
  const regionFlow=new Float32Array(mesh.numRegions);
  for(let s=0;s<mesh.numSolidSides;s++) regionFlow[mesh.r_begin_s(s)]=Math.max(regionFlow[mesh.r_begin_s(s)],map.flow_s[s]);
  for(let t=0;t<mesh.numSolidTriangles;t++) {
    const rs=[0,1,2].map(j=>mesh.r_begin_s(3*t+j));
    const xs=rs.map(r=>mesh.x_of_r(r)/1000*(size-1)),zs=rs.map(r=>mesh.y_of_r(r)/1000*(size-1));
    const den=(zs[1]-zs[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(zs[0]-zs[2]);
    if(Math.abs(den)<1e-8) continue;
    for(let z=Math.max(0,Math.ceil(Math.min(...zs)));z<=Math.min(size-1,Math.floor(Math.max(...zs)));z++) for(let x=Math.max(0,Math.ceil(Math.min(...xs)));x<=Math.min(size-1,Math.floor(Math.max(...xs)));x++) {
      const a=((zs[1]-zs[2])*(x-xs[2])+(xs[2]-xs[1])*(z-zs[2]))/den;
      const b=((zs[2]-zs[0])*(x-xs[2])+(xs[0]-xs[2])*(z-zs[2]))/den,c=1-a-b;
      if(a<-.0001||b<-.0001||c<-.0001) continue;
      const i=z*size+x;
      height[i]=a*map.elevation_r[rs[0]]+b*map.elevation_r[rs[1]]+c*map.elevation_r[rs[2]];
      rain[i]=a*map.rainfall_r[rs[0]]+b*map.rainfall_r[rs[1]]+c*map.rainfall_r[rs[2]];
      drainage[i]=Math.log1p(a*regionFlow[rs[0]]+b*regionFlow[rs[1]]+c*regionFlow[rs[2]]);
    }
  }
  return {size,height,rain,drainage,regions:mesh.numSolidRegions};
}

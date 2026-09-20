(function () {
  'use strict';

  if (window.customElements && window.customElements.get('zuvyr-model3d-viewer')) return;

  var GLB_MAGIC = 0x46546c67;
  var GLB_JSON = 0x4e4f534a;
  var GLB_BIN = 0x004e4942;
  var MAX_BYTES = 128 * 1024 * 1024;

  function viewerError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function identity() {
    return new Float32Array([
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1
    ]);
  }

  function multiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c += 1) {
      for (var r = 0; r < 4; r += 1) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function translation(x, y, z) {
    var out = identity();
    out[12] = x;
    out[13] = y;
    out[14] = z;
    return out;
  }

  function rotationX(angle) {
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    return new Float32Array([
      1,0,0,0,
      0,c,s,0,
      0,-s,c,0,
      0,0,0,1
    ]);
  }

  function rotationY(angle) {
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    return new Float32Array([
      c,0,-s,0,
      0,1,0,0,
      s,0,c,0,
      0,0,0,1
    ]);
  }

  function perspective(fov, aspect, near, far) {
    var f = 1 / Math.tan(fov / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect,0,0,0,
      0,f,0,0,
      0,0,(far + near) * nf,-1,
      0,0,(2 * far * near) * nf,0
    ]);
  }

  function quatMatrix(q) {
    var x = Number(q && q[0] || 0);
    var y = Number(q && q[1] || 0);
    var z = Number(q && q[2] || 0);
    var w = Number(q && q[3] === undefined ? 1 : q[3]);
    var xx=x*x, yy=y*y, zz=z*z;
    var xy=x*y, xz=x*z, yz=y*z;
    var wx=w*x, wy=w*y, wz=w*z;
    return new Float32Array([
      1-2*(yy+zz),2*(xy+wz),2*(xz-wy),0,
      2*(xy-wz),1-2*(xx+zz),2*(yz+wx),0,
      2*(xz+wy),2*(yz-wx),1-2*(xx+yy),0,
      0,0,0,1
    ]);
  }

  function scaleMatrix(s) {
    var out = identity();
    out[0] = Number(s && s[0] === undefined ? 1 : s[0]);
    out[5] = Number(s && s[1] === undefined ? 1 : s[1]);
    out[10] = Number(s && s[2] === undefined ? 1 : s[2]);
    return out;
  }

  function nodeMatrix(node) {
    if (Array.isArray(node && node.matrix) && node.matrix.length === 16) {
      return new Float32Array(node.matrix.map(Number));
    }
    var t = node && node.translation || [0,0,0];
    var r = node && node.rotation || [0,0,0,1];
    var s = node && node.scale || [1,1,1];
    return multiply(
      translation(Number(t[0]||0), Number(t[1]||0), Number(t[2]||0)),
      multiply(quatMatrix(r), scaleMatrix(s))
    );
  }

  function transformPoint(m, x, y, z) {
    return [
      m[0]*x + m[4]*y + m[8]*z + m[12],
      m[1]*x + m[5]*y + m[9]*z + m[13],
      m[2]*x + m[6]*y + m[10]*z + m[14]
    ];
  }

  function componentInfo(type) {
    if (type === 5120) return {bytes:1, get:function(v,o){return v.getInt8(o);}};
    if (type === 5121) return {bytes:1, get:function(v,o){return v.getUint8(o);}};
    if (type === 5122) return {bytes:2, get:function(v,o){return v.getInt16(o,true);}};
    if (type === 5123) return {bytes:2, get:function(v,o){return v.getUint16(o,true);}};
    if (type === 5125) return {bytes:4, get:function(v,o){return v.getUint32(o,true);}};
    if (type === 5126) return {bytes:4, get:function(v,o){return v.getFloat32(o,true);}};
    throw viewerError('unsupported_glb_component_type');
  }

  function typeSize(type) {
    if (type === 'SCALAR') return 1;
    if (type === 'VEC2') return 2;
    if (type === 'VEC3') return 3;
    if (type === 'VEC4') return 4;
    throw viewerError('unsupported_glb_accessor_type');
  }

  function accessorValues(json, bin, accessorIndex) {
    var accessor = json.accessors && json.accessors[accessorIndex];
    if (!accessor) throw viewerError('glb_accessor_missing');
    if (accessor.sparse) throw viewerError('glb_sparse_accessor_not_supported');
    var viewSpec = json.bufferViews && json.bufferViews[accessor.bufferView];
    if (!viewSpec) throw viewerError('glb_buffer_view_missing');
    if (Number(viewSpec.buffer || 0) !== 0) throw viewerError('glb_external_buffer_not_supported');

    var info = componentInfo(Number(accessor.componentType));
    var size = typeSize(accessor.type);
    var count = Number(accessor.count || 0);
    if (!Number.isSafeInteger(count) || count <= 0) throw viewerError('glb_accessor_count_invalid');

    var start = Number(viewSpec.byteOffset || 0) + Number(accessor.byteOffset || 0);
    var stride = Number(viewSpec.byteStride || (info.bytes * size));
    var end = start + (count - 1) * stride + info.bytes * size;
    if (start < 0 || end > bin.byteLength) throw viewerError('glb_accessor_out_of_bounds');

    var dataView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    var out = new Float64Array(count * size);
    for (var i = 0; i < count; i += 1) {
      var base = start + i * stride;
      for (var j = 0; j < size; j += 1) {
        out[i * size + j] = info.get(dataView, base + j * info.bytes);
      }
    }
    return {values:out, size:size, componentType:Number(accessor.componentType), count:count};
  }

  function parseGlb(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw viewerError('glb_too_small');
    var dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== GLB_MAGIC) throw viewerError('glb_magic_invalid');
    if (dv.getUint32(4, true) !== 2) throw viewerError('glb_version_unsupported');
    var declared = dv.getUint32(8, true);
    if (declared !== buffer.byteLength) throw viewerError('glb_length_mismatch');

    var offset = 12;
    var json = null;
    var bin = null;
    while (offset + 8 <= buffer.byteLength) {
      var length = dv.getUint32(offset, true);
      var type = dv.getUint32(offset + 4, true);
      offset += 8;
      if (length < 0 || offset + length > buffer.byteLength) throw viewerError('glb_chunk_out_of_bounds');
      if (type === GLB_JSON) {
        var bytes = new Uint8Array(buffer, offset, length);
        var text = new TextDecoder('utf-8').decode(bytes).replace(/\u0000+$/g, '').trim();
        json = JSON.parse(text);
      } else if (type === GLB_BIN) {
        bin = new Uint8Array(buffer, offset, length);
      }
      offset += length;
    }
    if (!json || !bin) throw viewerError('glb_required_chunk_missing');
    return {json:json, bin:bin};
  }

  function primitiveColor(json, primitive) {
    var material = json.materials && json.materials[primitive.material];
    var factor = material && material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor;
    if (!Array.isArray(factor) || factor.length < 3) return [0.78,0.80,0.84,1];
    return [
      clamp(Number(factor[0]),0,1),
      clamp(Number(factor[1]),0,1),
      clamp(Number(factor[2]),0,1),
      clamp(Number(factor[3] === undefined ? 1 : factor[3]),0,1)
    ];
  }

  function buildGeometry(parsed) {
    var json = parsed.json;
    var bin = parsed.bin;
    var nodes = Array.isArray(json.nodes) ? json.nodes : [];
    var meshes = Array.isArray(json.meshes) ? json.meshes : [];
    var sceneIndex = Number.isSafeInteger(Number(json.scene)) ? Number(json.scene) : 0;
    var scene = json.scenes && json.scenes[sceneIndex];
    if (!scene || !Array.isArray(scene.nodes)) throw viewerError('glb_scene_missing');

    var parts = [];
    var min = [Infinity,Infinity,Infinity];
    var max = [-Infinity,-Infinity,-Infinity];

    function visit(nodeIndex, parentMatrix) {
      var node = nodes[nodeIndex];
      if (!node) return;
      var world = multiply(parentMatrix, nodeMatrix(node));
      if (node.mesh !== undefined && meshes[node.mesh]) {
        var mesh = meshes[node.mesh];
        (mesh.primitives || []).forEach(function (primitive) {
          if (primitive.mode !== undefined && Number(primitive.mode) !== 4) return;
          if (!primitive.attributes || primitive.attributes.POSITION === undefined) return;
          var pos = accessorValues(json, bin, primitive.attributes.POSITION);
          if (pos.size !== 3) throw viewerError('glb_position_accessor_invalid');

          var indices;
          if (primitive.indices !== undefined) {
            var idx = accessorValues(json, bin, primitive.indices);
            if (idx.size !== 1) throw viewerError('glb_index_accessor_invalid');
            indices = new Uint32Array(idx.count);
            for (var ii=0; ii<idx.count; ii+=1) indices[ii] = Number(idx.values[ii]);
          } else {
            indices = new Uint32Array(pos.count);
            for (var si=0; si<pos.count; si+=1) indices[si] = si;
          }
          if (indices.length < 3 || indices.length % 3 !== 0) throw viewerError('glb_triangle_indices_invalid');

          var positions = new Float32Array(pos.count * 3);
          for (var p=0; p<pos.count; p+=1) {
            var transformed = transformPoint(world, pos.values[p*3], pos.values[p*3+1], pos.values[p*3+2]);
            positions[p*3]=transformed[0];
            positions[p*3+1]=transformed[1];
            positions[p*3+2]=transformed[2];
            for (var a=0;a<3;a+=1) {
              if (transformed[a] < min[a]) min[a]=transformed[a];
              if (transformed[a] > max[a]) max[a]=transformed[a];
            }
          }

          var normals = new Float32Array(positions.length);
          for (var t=0; t<indices.length; t+=3) {
            var ia=indices[t]*3, ib=indices[t+1]*3, ic=indices[t+2]*3;
            if (ic + 2 >= positions.length) throw viewerError('glb_index_out_of_bounds');
            var ax=positions[ia], ay=positions[ia+1], az=positions[ia+2];
            var bx=positions[ib], by=positions[ib+1], bz=positions[ib+2];
            var cx=positions[ic], cy=positions[ic+1], cz=positions[ic+2];
            var ux=bx-ax, uy=by-ay, uz=bz-az;
            var vx=cx-ax, vy=cy-ay, vz=cz-az;
            var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
            [ia,ib,ic].forEach(function (base) {
              normals[base]+=nx; normals[base+1]+=ny; normals[base+2]+=nz;
            });
          }
          for (var n=0;n<normals.length;n+=3) {
            var len=Math.hypot(normals[n],normals[n+1],normals[n+2])||1;
            normals[n]/=len; normals[n+1]/=len; normals[n+2]/=len;
          }

          parts.push({positions:positions,normals:normals,indices:indices,color:primitiveColor(json,primitive)});
        });
      }
      (node.children || []).forEach(function (child) { visit(Number(child), world); });
    }

    scene.nodes.forEach(function (nodeIndex) { visit(Number(nodeIndex), identity()); });
    if (!parts.length || !Number.isFinite(min[0])) throw viewerError('glb_no_supported_triangles');

    var center=[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2];
    var radius=Math.max(
      Math.abs(max[0]-center[0]),Math.abs(min[0]-center[0]),
      Math.abs(max[1]-center[1]),Math.abs(min[1]-center[1]),
      Math.abs(max[2]-center[2]),Math.abs(min[2]-center[2]),
      0.001
    );
    parts.forEach(function (part) {
      for (var i=0;i<part.positions.length;i+=3) {
        part.positions[i]=(part.positions[i]-center[0])/radius;
        part.positions[i+1]=(part.positions[i+1]-center[1])/radius;
        part.positions[i+2]=(part.positions[i+2]-center[2])/radius;
      }
    });
    return parts;
  }

  function shader(gl, type, source) {
    var sh=gl.createShader(type);
    gl.shaderSource(sh,source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) {
      var msg=gl.getShaderInfoLog(sh)||'shader_compile_failed';
      gl.deleteShader(sh);
      throw viewerError(msg);
    }
    return sh;
  }

  function program(gl) {
    var vs=shader(gl,gl.VERTEX_SHADER,
      '#version 300 es\n'+
      'in vec3 aPosition; in vec3 aNormal; uniform mat4 uMvp; uniform mat3 uNormal; out vec3 vNormal;'+
      'void main(){vNormal=normalize(uNormal*aNormal);gl_Position=uMvp*vec4(aPosition,1.0);}');
    var fs=shader(gl,gl.FRAGMENT_SHADER,
      '#version 300 es\nprecision highp float; in vec3 vNormal; uniform vec4 uColor; uniform float uExposure; out vec4 outColor;'+
      'void main(){vec3 n=normalize(vNormal);vec3 l=normalize(vec3(0.45,0.8,0.55));float d=max(dot(n,l),0.0);float rim=pow(1.0-max(abs(n.z),0.0),2.0)*0.16;float light=0.32+d*0.72+rim;outColor=vec4(clamp(uColor.rgb*light*uExposure,0.0,1.0),uColor.a);}');
    var p=gl.createProgram();
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
      var msg=gl.getProgramInfoLog(p)||'program_link_failed';
      gl.deleteProgram(p);throw viewerError(msg);
    }
    return p;
  }

  async function readLimited(response, signal) {
    var declared=Number(response.headers.get('content-length')||0);
    if (declared > MAX_BYTES) throw viewerError('viewer_model_too_large');
    if (!response.body || !response.body.getReader) {
      var all=await response.arrayBuffer();
      if (all.byteLength > MAX_BYTES) throw viewerError('viewer_model_too_large');
      return all;
    }
    var reader=response.body.getReader();
    var chunks=[], total=0;
    try {
      while (true) {
        if (signal && signal.aborted) throw viewerError('viewer_load_aborted');
        var item=await reader.read();
        if (item.done) break;
        total += item.value.byteLength;
        if (total > MAX_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          throw viewerError('viewer_model_too_large');
        }
        chunks.push(item.value);
      }
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
    var merged=new Uint8Array(total), offset=0;
    chunks.forEach(function(chunk){merged.set(chunk,offset);offset+=chunk.byteLength;});
    return merged.buffer;
  }

  class ZuvyrModel3dViewer extends HTMLElement {
    static get observedAttributes() { return ['src','exposure']; }

    constructor() {
      super();
      this._abort=null;
      this._gl=null;
      this._program=null;
      this._parts=[];
      this._yaw=0.55;
      this._pitch=-0.28;
      this._distance=3.2;
      this._drag=null;
      this._raf=0;
      this._resize=null;

      var root=this.attachShadow({mode:'open'});
      var style=document.createElement('style');
      style.textContent=
        ':host{display:block;position:relative;min-height:320px;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 50% 38%,#24262b,#101114 68%,#090a0c);outline:none}'+
        'canvas{display:block;width:100%;height:100%;min-height:320px;touch-action:none}'+
        '.status{position:absolute;left:12px;bottom:12px;max-width:calc(100% - 24px);padding:7px 10px;border-radius:9px;background:rgba(0,0,0,.58);color:#fff;font:12px/1.35 system-ui,sans-serif;pointer-events:none}'+
        ':host([data-ready="true"]) .status{display:none}';
      this._canvas=document.createElement('canvas');
      this._canvas.setAttribute('part','canvas');
      this._canvas.tabIndex=0;
      this._canvas.setAttribute('aria-label','Interactive 3D model viewer. Drag to orbit, scroll to zoom, arrow keys to rotate, plus or minus to zoom, R to reset.');
      this._status=document.createElement('div');
      this._status.className='status';
      this._status.textContent='Loading canonical GLB…';
      root.append(style,this._canvas,this._status);

      this._onPointerDown=this._pointerDown.bind(this);
      this._onPointerMove=this._pointerMove.bind(this);
      this._onPointerUp=this._pointerUp.bind(this);
      this._onWheel=this._wheel.bind(this);
      this._onKey=this._key.bind(this);
    }

    connectedCallback() {
      this._canvas.addEventListener('pointerdown',this._onPointerDown);
      this._canvas.addEventListener('pointermove',this._onPointerMove);
      this._canvas.addEventListener('pointerup',this._onPointerUp);
      this._canvas.addEventListener('pointercancel',this._onPointerUp);
      this._canvas.addEventListener('wheel',this._onWheel,{passive:false});
      this._canvas.addEventListener('keydown',this._onKey);
      this._resize=new ResizeObserver(this._scheduleDraw.bind(this));
      this._resize.observe(this);
      if (this.getAttribute('src')) this._load();
    }

    disconnectedCallback() {
      if(this._abort)this._abort.abort();
      if(this._resize)this._resize.disconnect();
      cancelAnimationFrame(this._raf);
      this._canvas.removeEventListener('pointerdown',this._onPointerDown);
      this._canvas.removeEventListener('pointermove',this._onPointerMove);
      this._canvas.removeEventListener('pointerup',this._onPointerUp);
      this._canvas.removeEventListener('pointercancel',this._onPointerUp);
      this._canvas.removeEventListener('wheel',this._onWheel);
      this._canvas.removeEventListener('keydown',this._onKey);
      this._destroyGl();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue===newValue) return;
      if (name==='src' && this.isConnected) this._load();
      if (name==='exposure') this._scheduleDraw();
    }

    resetCamera() {
      this._yaw=0.55;this._pitch=-0.28;this._distance=3.2;this._scheduleDraw();
    }

    _setStatus(text) {
      this.dataset.ready='false';
      this._status.textContent=text;
    }

    async _load() {
      var src=String(this.getAttribute('src')||'').trim();
      if(!src)return;
      if(this._abort)this._abort.abort();
      this._abort=new AbortController();
      var signal=this._abort.signal;
      this._setStatus('Loading canonical GLB…');

      try {
        var parsedUrl=new URL(src,window.location.href);
        if(parsedUrl.protocol!=='https:')throw viewerError('viewer_https_required');
        var response=await fetch(parsedUrl.href,{
          method:'GET',
          mode:'cors',
          credentials:'omit',
          cache:'no-store',
          referrerPolicy:'no-referrer',
          signal:signal,
          headers:{Accept:'model/gltf-binary,application/octet-stream;q=0.9,*/*;q=0.1'}
        });
        if(!response.ok)throw viewerError('viewer_model_fetch_failed');
        var buffer=await readLimited(response,signal);
        if(signal.aborted)return;
        var parts=buildGeometry(parseGlb(buffer));
        this._initGl(parts);
        this.dataset.ready='true';
        this.dispatchEvent(new CustomEvent('zuvyr-viewer-ready',{bubbles:true}));
      } catch(error) {
        if(signal.aborted)return;
        this._destroyGl();
        this._setStatus('3D preview unavailable: '+String(error && (error.code||error.message)||'viewer_error'));
        this.dispatchEvent(new CustomEvent('zuvyr-viewer-error',{bubbles:true,detail:{code:String(error && (error.code||error.message)||'viewer_error')}}));
      }
    }

    _destroyGl() {
      var gl=this._gl;
      if(gl){
        this._parts.forEach(function(part){
          if(part.pos)gl.deleteBuffer(part.pos);
          if(part.normal)gl.deleteBuffer(part.normal);
          if(part.index)gl.deleteBuffer(part.index);
          if(part.vao)gl.deleteVertexArray(part.vao);
        });
        if(this._program)gl.deleteProgram(this._program);
      }
      this._parts=[];this._program=null;this._gl=null;
    }

    _initGl(parts) {
      this._destroyGl();
      var gl=this._canvas.getContext('webgl2',{
        alpha:false,
        antialias:true,
        depth:true,
        powerPreference:'high-performance',
        preserveDrawingBuffer:false
      });
      if(!gl)throw viewerError('webgl2_unavailable');
      var prog=program(gl);
      var aPos=gl.getAttribLocation(prog,'aPosition');
      var aNormal=gl.getAttribLocation(prog,'aNormal');
      var built=parts.map(function(part){
        var vao=gl.createVertexArray();gl.bindVertexArray(vao);
        var pos=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pos);gl.bufferData(gl.ARRAY_BUFFER,part.positions,gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,0,0);
        var normal=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,part.normals,gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aNormal);gl.vertexAttribPointer(aNormal,3,gl.FLOAT,false,0,0);
        var index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,part.indices,gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return {vao:vao,pos:pos,normal:normal,index:index,count:part.indices.length,color:part.color};
      });
      this._gl=gl;this._program=prog;this._parts=built;
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      this.resetCamera();
    }

    _scheduleDraw() {
      if(this._raf)return;
      var self=this;
      this._raf=requestAnimationFrame(function(){self._raf=0;self._draw();});
    }

    _draw() {
      var gl=this._gl;
      if(!gl||!this._program)return;
      var ratio=clamp(window.devicePixelRatio||1,1,2);
      var w=Math.max(1,Math.round(this._canvas.clientWidth*ratio));
      var h=Math.max(1,Math.round(this._canvas.clientHeight*ratio));
      if(this._canvas.width!==w||this._canvas.height!==h){this._canvas.width=w;this._canvas.height=h;}
      gl.viewport(0,0,w,h);
      gl.clearColor(0.055,0.06,0.07,1);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this._program);

      var projection=perspective(Math.PI/4,w/h,0.05,100);
      var rot=multiply(rotationX(this._pitch),rotationY(this._yaw));
      var view=multiply(translation(0,0,-this._distance),rot);
      var mvp=multiply(projection,view);
      gl.uniformMatrix4fv(gl.getUniformLocation(this._program,'uMvp'),false,mvp);
      gl.uniformMatrix3fv(gl.getUniformLocation(this._program,'uNormal'),false,new Float32Array([
        rot[0],rot[1],rot[2],
        rot[4],rot[5],rot[6],
        rot[8],rot[9],rot[10]
      ]));
      var exposure=clamp(Number(this.getAttribute('exposure')||1),0.25,3);
      gl.uniform1f(gl.getUniformLocation(this._program,'uExposure'),exposure);
      var colorLoc=gl.getUniformLocation(this._program,'uColor');
      this._parts.forEach(function(part){
        gl.bindVertexArray(part.vao);
        gl.uniform4fv(colorLoc,new Float32Array(part.color));
        gl.drawElements(gl.TRIANGLES,part.count,gl.UNSIGNED_INT,0);
      });
      gl.bindVertexArray(null);
    }

    _pointerDown(event) {
      this._drag={x:event.clientX,y:event.clientY,id:event.pointerId};
      this._canvas.setPointerCapture(event.pointerId);
      this._canvas.focus({preventScroll:true});
    }
    _pointerMove(event) {
      if(!this._drag||this._drag.id!==event.pointerId)return;
      var dx=event.clientX-this._drag.x,dy=event.clientY-this._drag.y;
      this._drag.x=event.clientX;this._drag.y=event.clientY;
      this._yaw+=dx*0.008;
      this._pitch=clamp(this._pitch+dy*0.008,-1.45,1.45);
      this._scheduleDraw();
    }
    _pointerUp(event) {
      if(this._drag&&this._drag.id===event.pointerId)this._drag=null;
    }
    _wheel(event) {
      event.preventDefault();
      this._distance=clamp(this._distance*Math.exp(event.deltaY*0.001),1.4,8);
      this._scheduleDraw();
    }
    _key(event) {
      var handled=true;
      if(event.key==='ArrowLeft')this._yaw-=0.12;
      else if(event.key==='ArrowRight')this._yaw+=0.12;
      else if(event.key==='ArrowUp')this._pitch=clamp(this._pitch-0.12,-1.45,1.45);
      else if(event.key==='ArrowDown')this._pitch=clamp(this._pitch+0.12,-1.45,1.45);
      else if(event.key==='+'||event.key==='=')this._distance=clamp(this._distance*0.9,1.4,8);
      else if(event.key==='-'||event.key==='_')this._distance=clamp(this._distance*1.1,1.4,8);
      else if(event.key==='r'||event.key==='R'){this.resetCamera();return;}
      else handled=false;
      if(handled){event.preventDefault();this._scheduleDraw();}
    }
  }

  if (window.customElements) {
    window.customElements.define('zuvyr-model3d-viewer',ZuvyrModel3dViewer);
  }
})();
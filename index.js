import * as THREE from 'three';

import metaversefile from 'metaversefile';

const {useApp, useFrame, useInternals, useLocalPlayer, useLoaders, useRenderSettings} = metaversefile;
const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');
const textureLoader = new THREE.TextureLoader();
const smokeTexture = textureLoader.load(baseUrl + `./textures/smoke.png`);
const gradientTexture = textureLoader.load(baseUrl + `./textures/gradient.png`);


export default () => {
  const app = useApp();
  const {renderer, camera, scene} = useInternals();
  const localPlayer = useLocalPlayer();

  const _getGeometry = (geometry, attributeSpecs, particleCount) => {
    const geometry2 = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(k => {
    geometry2.setAttribute(k, geometry.attributes[k]);
    });
    geometry2.setIndex(geometry.index);

    const positions = new Float32Array(particleCount * 3);
    const positionsAttribute = new THREE.InstancedBufferAttribute(positions, 3);
    geometry2.setAttribute('positions', positionsAttribute);

    for(const attributeSpec of attributeSpecs){
        const {
            name,
            itemSize,
        } = attributeSpec;
        const array = new Float32Array(particleCount * itemSize);
        geometry2.setAttribute(name, new THREE.InstancedBufferAttribute(array, itemSize));
    }

    return geometry2;
  };
  {
    const particleCount = 250;
    let info = {
      velocity: [particleCount],
      offset: [particleCount]
    }
    const groupCount = 5;
    let groupInfo = {
      position: [groupCount],
      startTime: [groupCount],
      life: [groupCount],
      scale: [groupCount],
    }
    for (let i = 0; i < groupCount; i ++) {
      groupInfo.position[i] = new THREE.Vector3((Math.random() - 0.5) * 100, 0, (Math.random() - 0.5) * 100);
      groupInfo.startTime[i] = 0;
      groupInfo.life[i] = 1000 + Math.random() * 1000;
    }
    let acc = new THREE.Vector3(-0.000, 0.0008, 0.0018);
    const attributeSpecs = [];
    attributeSpecs.push({name: 'offset', itemSize: 2});
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'opacity', itemSize: 1});
    attributeSpecs.push({name: 'index', itemSize: 1});
    // attributeSpecs.push({name: 'textureRotation', itemSize: 1});
    const geometry2 = new THREE.PlaneBufferGeometry(5, 5);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
    
    for(let i = 0; i < particleCount; i++){
      info.velocity[i] = new THREE.Vector3();
      info.offset[i] = Math.floor(Math.random() * 80);
    }
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        cameraBillboardQuaternion: {
          value: new THREE.Quaternion(),
        },
        gradientTexture: {
          value: gradientTexture
        },
        smokeTexture: {
          value: smokeTexture
        }
      },
      vertexShader: `
          ${THREE.ShaderChunk.common}
          ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
          uniform float uTime;
          uniform vec4 cameraBillboardQuaternion;
          
          attribute float scales;
          attribute float opacity;
          attribute vec2 offset;
          attribute vec3 positions;
          attribute float index;

          varying float vOpacity;
          varying float vIndex;
          varying vec2 vUv;
          varying vec2 vOffset;
          varying vec3 vWorldPosition;
          
          vec3 rotateVecQuat(vec3 position, vec4 q) {
            vec3 v = position.xyz;
            return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
          }
          void main() { 
            vIndex = index;
            vOpacity = opacity;
            vOffset = offset; 
            vUv = uv;
            vec3 pos = position;
            pos = rotateVecQuat(pos, cameraBillboardQuaternion);
            pos *= scales;
            pos += positions;
            vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
            vWorldPosition = modelPosition.xyz;
            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectionPosition = projectionMatrix * viewPosition;
            gl_Position = projectionPosition;
            ${THREE.ShaderChunk.logdepthbuf_vertex}
          }
      `,
      fragmentShader: `
          ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
          uniform float uTime;
          uniform sampler2D smokeTexture;
          uniform sampler2D gradientTexture;
          
          varying vec2 vUv;
          varying vec2 vOffset;
          varying float vOpacity;
          varying float vIndex;
          varying vec3 vWorldPosition;
          
          void main() {
            vec4 smoke = texture2D(smokeTexture, 
              vec2(
                vUv.x / 10. + vOffset.x,
                vUv.y / 9. + vOffset.y
              )
            ); 
            vec4 gradient = texture2D(gradientTexture, vec2(smoke.a)); 
            gl_FragColor = smoke;
            // gl_FragColor.rgb *= 0.1;
            gl_FragColor.rgb = mix(vec3(0.968, 0.880, 0.255), vec3(0.980, 0.251, 0.155), smoke.r * 3.);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.), (vIndex / 89.) * 1.);
            gl_FragColor.a *= vOpacity * pow(clamp(vWorldPosition.y / 5., 0., 1.), 2.);
            ${THREE.ShaderChunk.logdepthbuf_fragment}
          }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      // blending: THREE.AdditiveBlending,
    });
    const fire = new THREE.InstancedMesh(geometry, material, particleCount);
    app.add(fire);
    const maxEmit = 1;
    let count = 0;
    useFrame(({timestamp}) => {
      const player = useLocalPlayer();
      // fire.position.copy(player.position);
      // fire.position.y = 0;
      const scalesAttribute = fire.geometry.getAttribute('scales');
      const positionsAttribute = fire.geometry.getAttribute('positions');
      const offsetAttribute = fire.geometry.getAttribute('offset');
      const indexAttribute = fire.geometry.getAttribute('index');
      const opacityAttribute = fire.geometry.getAttribute('opacity');
      
      // const emitSmoke = (px, py, pz, maxEmit) => {
      //   let emitCount = 0;
      //   for(let i = 0; i < particleCount; i++){
      //     if(info.offset[i] >= 90 && emitCount < maxEmit) {
      //       const groupNumber = Math.floor(i / 50);
      //       info.offset[i] = 10 + Math.floor(Math.random() * 10);
      //       positionsAttribute.setXYZ(i, groupInfo.position[groupNumber].x, groupInfo.position[groupNumber].y, groupInfo.position[groupNumber].z);
      //       scalesAttribute.setX(i, Math.random() * 2 + 2);
      //       opacityAttribute.setX(i, 1.0);
      //       info.velocity[i].set(
      //         (Math.random() - 0.5) * 0.1,
      //         0.1 + Math.random() * 0.1,
      //         (Math.random() - 0.5) * 0.1
      //       )
      //       emitCount ++;
      //     }
      //   }
      // }

      const handelSmoke = () => {
        let emitCount = 0;
        for(let i = 0; i < particleCount; i++){
          if(info.offset[i] >= 90) {
            info.offset[i] = 10 + Math.floor(Math.random() * 10);
            const groupNumber = Math.floor(i / 50);
            const s = groupInfo.scale[groupNumber]
            positionsAttribute.setXYZ(i, groupInfo.position[groupNumber].x, groupInfo.position[groupNumber].y, groupInfo.position[groupNumber].z);
            scalesAttribute.setX(i, (Math.random() * 2 + 2) * s);
            opacityAttribute.setX(i, 1.0);
            info.velocity[i].set(
              (Math.random() - 0.5) * 0.1 * s,
              (0.1 + Math.random() * 0.1) * s,
              (Math.random() - 0.5) * 0.1 * s
            )
            emitCount ++;
          }
        }
        for(let i = 0; i < particleCount; i++){
          if (info.offset[i] >= 59) {
            opacityAttribute.setX(i, (89 - info.offset[i]) / 30);
          }
          indexAttribute.setX(i, info.offset[i]);
          offsetAttribute.setXY(i, (info.offset[i] % 10) * (1. / 10.), (8 / 9) - Math.floor(info.offset[i] / 10) * (1 / 9));
  
          positionsAttribute.setXYZ(
            i, 
            positionsAttribute.getX(i) + info.velocity[i].x, 
            positionsAttribute.getY(i) + info.velocity[i].y, 
            positionsAttribute.getZ(i) + info.velocity[i].z
          );
          scalesAttribute.setX(i, scalesAttribute.getX(i) * 1.006);
          if (count % 2 === 0)
            info.offset[i] ++;
        }
      }
      handelSmoke();

      const radius = 1000;
      for (let i = 0; i < groupCount; i ++) {
        if (timestamp - groupInfo.startTime[i] > groupInfo.life[i]) {
          groupInfo.position[i].set(
            player.position.x + (Math.random() - 0.5) * radius,
            0,
            player.position.z + (Math.random() - 0.5) * radius,
          )
          groupInfo.startTime[i] = timestamp;
          groupInfo.life[i] = 5000 + Math.random() * 5000;
          groupInfo.scale[i] = 1 + Math.random() * 2;
        }
      }

      
      // if (count % 100 === 0) {
      //   // console.log('emit')
      //   emitSmoke(
      //     player.position.x + (Math.random() - 0.5) * radius,
      //     Math.random(),
      //     player.position.z + (Math.random() - 0.5) * radius,
      //     10 + Math.floor(Math.random() * 5)
      //   )
      // }
      // emitSmoke(
      //   player.position.x + (Math.random() - 0.5) * 0.1,
      //   Math.random() * 1,
      //   player.position.z + (Math.random() - 0.5) * 0.1,
      //   1
      // )
      
      count ++;
      scalesAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true; 
      offsetAttribute.needsUpdate = true; 
      opacityAttribute.needsUpdate = true; 
      indexAttribute.needsUpdate = true; 
      fire.material.uniforms.cameraBillboardQuaternion.value.copy(camera.quaternion);
      app.updateMatrixWorld();
    });
  }
  
  
 
  app.setComponent('renderPriority', 'low');
  
  return app;
};

import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame, useThree, createPortal } from '@react-three/fiber'
import { OrbitControls, Box, Sphere, Environment, ContactShadows, Line, PivotControls, useGLTF, Text, MeshReflectorMaterial, Sky, AccumulativeShadows, RandomizedLight, Grid, RoundedBox, BakeShadows, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import SunCalc from 'suncalc'
import gsap from 'gsap'
import { useStore } from '../store'

const DUSK_COLOR = new THREE.Color('#ff4400'); // Derin turuncu/kırmızı gün doğumu
const SUNRISE_COLOR = new THREE.Color('#ffcc66'); // Altın sarısı sabah
const NOON_COLOR = new THREE.Color('#ffffff'); // Saf beyaz öğle

// A simple mock architectural model
function MockArchitecture() {
  return (
    <group>
      <Box args={[10, 5, 8]} position={[0, 2.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#eeeeee" />
      </Box>
      {/* Box 2'nin Z eksenini -2 yerine -1.9 yaparak Box 1 ile arka yüzeylerinin çakışmasını (Z-Fighting) önledik */}
      <Box args={[4, 8, 4]} position={[5, 4, -1.9]} castShadow receiveShadow>
        <meshStandardMaterial color="#dddddd" />
      </Box>
      <Sphere args={[2, 32, 32]} position={[-3, 2, 4]} castShadow receiveShadow>
        <meshStandardMaterial color="#ff5555" />
      </Sphere>
      {/* Yansıtıcı zemin, gerçekçi yansıma için */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial
          resolution={1024}
          mirror={0.6}
          mixBlur={20}
          mixStrength={0.9}
          blur={[400, 100]}
          depthScale={0.4}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.5}
          color="#0b0c0f"
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>
    </group>
  )
}

function CustomModel() {
  const { modelUrl, setModelLayers, checkpoints, activeIndex, layerColors } = useStore()
  if (!modelUrl) return null;
  const { scene } = useGLTF(modelUrl)

  // Maket (Clay) materyali
  const clayMaterial = useMemo(() => new THREE.MeshStandardMaterial({ 
    color: '#eeeeee', 
    roughness: 0.9, 
    metalness: 0.05 
  }), [])

  // Katmanları (Grupları) parse et ve orijinal materyalleri yedekle
  useEffect(() => {
    if (scene) {
      // Calculate model bounds for dynamic shadow scaling
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 10);
      useStore.getState().setModelSize(maxDim);

      const layers = []
      scene.traverse(c => {
        // Otomatik oluşturulan RootNode, SketchUp vb. sarmalayıcıları atla
        if (c.name && (c.type === 'Group' || c.type === 'Object3D')) {
          const lowerName = c.name.toLowerCase();
          if (!lowerName.includes('root') && !lowerName.includes('scene') && !lowerName.includes('sketchup')) {
            layers.push(c.name)
          }
        }
      })
      setModelLayers([...new Set(layers)])
      
      // Tüm meshlerin gölgelerini aç ve orijinal materyallerini kaydet
      scene.traverse(node => {
        if (node.isMesh) {
          node.castShadow = true
          node.receiveShadow = true
          if (!node.userData.originalMaterial) {
            node.userData.originalMaterial = node.material;
          }
        }
      })
    }
  }, [scene, setModelLayers])

  // Bulunulan faza göre katmanların görünürlüğünü ve materyalini uygula
  useEffect(() => {
    if (scene) {
      const hiddenLayers = checkpoints[activeIndex]?.hiddenLayers || [];
      const isClay = checkpoints[activeIndex]?.clayMode || false;
      
      // Önce tüm modelin görünürlüğünü sıfırla (aç) ve materyalleri ayarla
      scene.traverse(child => {
        if (child.name) child.visible = true;
        
        // Maket Modu kontrolü
        if (child.isMesh && child.userData.originalMaterial) {
          child.material = isClay ? clayMaterial : child.userData.originalMaterial;
        }
      });
      
      // Sonra renk ezmelerini (Override) uygula (Maket modu kapalıysa)
      if (!isClay && layerColors) {
        Object.keys(layerColors).forEach(layerName => {
          const colorHex = layerColors[layerName];
          if (!colorHex) return;
          const groupOrMesh = scene.getObjectByName(layerName);
          if (groupOrMesh) {
            groupOrMesh.traverse(mesh => {
              if (mesh.isMesh && mesh.userData.originalMaterial) {
                // Performanslı klonlama: Aynı rengi sürekli baştan yaratmamak için cache kullan
                if (!mesh.userData.clonedMaterials) mesh.userData.clonedMaterials = {};
                if (!mesh.userData.clonedMaterials[colorHex]) {
                   const clone = mesh.userData.originalMaterial.clone();
                   clone.color.set(colorHex);
                   mesh.userData.clonedMaterials[colorHex] = clone;
                }
                mesh.material = mesh.userData.clonedMaterials[colorHex];
              }
            });
          }
        });
      }
      
      // Sonra sadece o fazda gizlenmesi istenen katmanları gizle
      scene.traverse(child => {
        if (child.name && hiddenLayers.includes(child.name)) {
          child.visible = false;
        }
      });
    }
  }, [scene, activeIndex, checkpoints, clayMaterial, layerColors])

  return <primitive object={scene} />
}

function VideoTextOverlay({ overlayRef }) {
  const { checkpoints, technicalViews, activeIndex, recordingMode } = useStore();
  const { camera } = useThree();

  if (recordingMode !== 'full') return null;
  
  const isGallery = activeIndex >= checkpoints.length;
  const cp = isGallery ? technicalViews[activeIndex - checkpoints.length] : checkpoints[activeIndex];
  if (!cp || cp.isTransit) return null;

  // Ekranın %10 sol boşlukla (padding: 0 10vw) ortalanmış UI kutusunu 3D uzayda kurgula
  // Kameranın -3 birim uzağındaki ekran genişliği (Perspektif vs Ortho ayrımı)
  let heightAtZ, widthAtZ;
  
  if (camera.isPerspectiveCamera) {
    const fov = camera.fov * (Math.PI / 180);
    heightAtZ = 2 * Math.tan(fov / 2) * 3;
    widthAtZ = heightAtZ * camera.aspect;
  } else {
    // Orthographic: height = (top - bottom) / zoom. default drei ortho is usually 2 units high total
    heightAtZ = 2 / camera.zoom;
    widthAtZ = heightAtZ * camera.aspect;
  }

  // Kutunun genişliği ekranın ~%30'u kadar olsun
  const boxW = widthAtZ * 0.35;
  const boxH = boxW * 0.55;
  
  // X pozisyonu: Ekranın sol kenarından (%10 boşluk) başla, kutunun yarısı kadar sağa kaydır
  const xPos = (-widthAtZ / 2) + (widthAtZ * 0.1) + (boxW / 2);
  const yPos = 0; // align-items: center

  return (
    <group ref={overlayRef}>
      {/* Container: Sola hizalı, Dikey ortalı, useFrame'de -3Z kaydırılıyor */}
      <group position={[xPos, yPos, 0]}>
        {/* UI Background (Flat UI Look) */}
        <RoundedBox args={[boxW, boxH, 0.01]} radius={0.05} smoothness={4} position={[0, 0, -0.01]}>
          <meshBasicMaterial 
            color="#0f0f0f"
            transparent={true}
            opacity={0.7}
            depthTest={false}
          />
        </RoundedBox>

        {/* Title */}
        <Text 
          position={[-boxW/2 + 0.2, boxH/2 - 0.25, 0]} 
          fontSize={0.14} 
          fontWeight={600}
          color="#ffffff" 
          anchorX="left" 
          anchorY="top" 
          maxWidth={boxW - 0.4}
          depthTest={false} 
          renderOrder={100}
        >
          {cp.title}
        </Text>
        
        {/* Body */}
        <Text 
          position={[-boxW/2 + 0.2, boxH/2 - 0.5, 0]} 
          fontSize={0.065} 
          fontWeight={300}
          color="#cccccc" 
          anchorX="left" 
          anchorY="top" 
          maxWidth={boxW - 0.4} 
          lineHeight={1.5}
          depthTest={false} 
          renderOrder={100}
        >
          {cp.body || cp.description}
        </Text>
      </group>
    </group>
  );
}
function KeyboardFly({ orbitRef }) {
  const { editorMode } = useStore();
  const { camera } = useThree();
  const keys = useRef({});

  useEffect(() => {
    const down = (e) => (keys.current[e.code] = true);
    const up = (e) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, delta) => {
    if (!editorMode || !orbitRef.current) return;
    
    // Girdi alanlarındayken klavye hareketini iptal et
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

    // Hızı modelin boyutuna göre dinamik ayarla
    const ms = useStore.getState().modelSize || 100;
    const speed = ms * 0.5 * delta;

    const moveVec = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    if (keys.current['KeyW']) moveVec.add(forward.multiplyScalar(speed));
    if (keys.current['KeyS']) moveVec.add(forward.multiplyScalar(-speed));
    if (keys.current['KeyA']) moveVec.add(right.multiplyScalar(-speed));
    if (keys.current['KeyD']) moveVec.add(right.multiplyScalar(speed));

    if (keys.current['Space']) {
      const dir = (keys.current['ShiftLeft'] || keys.current['ShiftRight']) ? -1 : 1;
      moveVec.z += dir * speed;
    }

    if (moveVec.lengthSq() > 0) {
      camera.position.add(moveVec);
      orbitRef.current.target.add(moveVec);
    }
  });

  return null;
}

export default function Scene() {
  const { editorMode, checkpoints, technicalViews, activeIndex, updateCheckpoint, modelUrl, lighting, showHelpers, modelSize } = useStore()
  const { camera, gl, scene } = useThree()
  const orbitRef = useRef()
  const overlayRef = useRef()
  const progressRef = useRef(0)

  const isGalleryPhase = activeIndex >= checkpoints.length;
  const activeCp = isGalleryPhase 
    ? technicalViews[activeIndex - checkpoints.length] 
    : checkpoints[activeIndex];
  const isOrtho = isGalleryPhase;

  const orbitRotationRef = useRef(new THREE.Quaternion())
  const isInteractingRef = useRef(false)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [sessionZoom, setSessionZoom] = useState(1)
  
  // Reset session zoom when changing views in gallery
  useEffect(() => {
    setSessionZoom(1);
  }, [activeIndex]);
  
  const skyRef = useRef()
  const dirLightRef = useRef()
  const ambientLightRef = useRef()

  const handlePointerDown = (e) => {
    // OPTION/ALT + SOL TIK: Yüzeye Dik Bak (macOS Desteği dahil)
    if (editorMode && (e.altKey || e.metaKey) && e.button === 0 && e.face) {
      e.stopPropagation();
      const cp = checkpoints[activeIndex];
      if (!cp) return;

      // 1. Tıklanan yüzeyin normalini dünya koordinat sistemine çevir
      const normal = e.face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
      normal.applyMatrix3(normalMatrix).normalize();

      // 2. Kamerayı bu normal doğrultusunda geriye çek
      const dist = camera.position.distanceTo(e.point);
      const newPos = e.point.clone().add(normal.multiplyScalar(dist));

      // 3. Eksen (Up) Hizalaması: Mimari standartlara göre
      // Eğer yüzey yere paralel ise (Plan bakışı), Up vektörünü kuzeye ([0,0,-1]) hizalarız.
      // Diğer durumlarda Up vektörünü her zaman dünyanın yukarı aksına ([0,1,0]) sabitleriz.
      const isHorizontalSurface = Math.abs(normal.y) > 0.8;
      const upVec = isHorizontalSurface ? [0, 0, -1] : [0, 1, 0];

      // 4. Store'u güncelle (Pozisyon, Hedef ve Up vektörü)
      updateCheckpoint(activeIndex, {
        cameraPos: newPos.toArray(),
        lookAtPos: e.point.toArray(),
        cameraUp: upVec,
        isOrtho: true
      });

      // Mevcut kamerayı da anında güncelle
      camera.up.set(...upVec);
      camera.lookAt(...e.point.toArray());
      if (orbitRef.current) {
        orbitRef.current.target.set(...e.point.toArray());
        orbitRef.current.update();
      }
      return;
    }

    // Sadece sol tık (Orbit başlangıcı) ve editör modu aktifken
    if (editorMode && orbitRef.current && e.button === 0) {
      e.stopPropagation(); 
      
      // 1. Kameradan tıklanan yüzeye olan mesafeyi ölç
      const dist = camera.position.distanceTo(e.point);
      
      // 2. Kameranın baktığı yönü (ileri vektörünü) al
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      
      // 3. Pivot noktasını (target), kameranın baktığı doğrultuda tam olarak o mesafeye yerleştir.
      // Bu sayede kamera ASLA sağa sola dönmez (snap/oynama olmaz), ama Orbit yarıçapı tam olarak dokunduğunuz derinliğe ayarlanır.
      orbitRef.current.target.copy(camera.position).add(forward.multiplyScalar(dist));
      orbitRef.current.update();
    }
  };

  // SketchUp tarzı İmlece Doğru Zoom (Zoom to Cursor)
  useEffect(() => {
    if (!editorMode) return;

    const domEl = gl.domElement;
    
    const handleWheel = (e) => {
      if (!orbitRef.current) return;
      
      e.preventDefault();
      
      const rect = domEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      const mouse = new THREE.Vector2(x, y);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Endüstri standardı: Önce modelle kesişim ara, yoksa hedef düzlemini kullan
      const intersects = raycaster.intersectObjects(scene.children, true);
      let zoomPoint = new THREE.Vector3();
      
      if (intersects.length > 0) {
        zoomPoint.copy(intersects[0].point);
      } else {
        const target = orbitRef.current.target;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          camera.getWorldDirection(new THREE.Vector3()),
          target
        );
        raycaster.ray.intersectPlane(plane, zoomPoint);
      }

      // Yakınlaşma katsayısı (Logaritmik/Üssel geçiş daha doğaldır)
      const zoomFactor = Math.pow(0.95, e.deltaY / 100);
      
      // Mesafe Kontrolü: Çok yaklaşmayı veya çok uzaklaşmayı sınırla
      const currentDist = camera.position.distanceTo(zoomPoint);
      if (zoomFactor > 1 && currentDist < 0.001) return;
      if (zoomFactor < 1 && currentDist > 5000) return;

      // Hem kamerayı hem hedefi Zoom noktasına göre ölçeklendirerek yaklaştır/uzaklaştır
      // Bu sayede Paralel İzdüşüm'de 'Mesafe = Zoom' ilişkisi korunur ve imleç altındaki nokta sabit kalır.
      camera.position.lerpVectors(zoomPoint, camera.position, 1 / zoomFactor);
      orbitRef.current.target.lerpVectors(zoomPoint, orbitRef.current.target, 1 / zoomFactor);
      
      orbitRef.current.update();
    };

    // passive: false ile sayfa kaymasını (scroll) engelliyoruz
    domEl.addEventListener('wheel', handleWheel, { passive: false });
    
    // Sağ tık menüsünü engelle ve çift sağ tıkı (veya çift sol tıkı) yakala
    let lastRightClick = 0;
    let lastLeftClick = 0;

    const performZoom = () => {
      const size = useStore.getState().modelSize || 50;
      if (orbitRef.current) {
        gsap.to(camera.position, {
          x: size * 1.2,
          y: size * 0.8,
          z: size * 1.2,
          duration: 1,
          ease: "power3.inOut",
          onUpdate: () => {
            camera.updateProjectionMatrix();
            orbitRef.current.update();
          }
        });
        gsap.to(orbitRef.current.target, {
          x: 0, y: size * 0.2, z: 0,
          duration: 1,
          ease: "power3.inOut"
        });
        
        const activeCp = useStore.getState().checkpoints[useStore.getState().activeIndex];
        if (activeCp?.isOrtho) {
          updateCheckpoint(useStore.getState().activeIndex, { orthoZoom: 5 });
        }
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastRightClick < 300) performZoom();
      lastRightClick = now;
    };

    domEl.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      domEl.removeEventListener('wheel', handleWheel);
      domEl.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [editorMode, camera, gl, updateCheckpoint]);

  // Animasyon geçişlerini zaman bazlı kontrol etmek için ref
  const transitionRef = useRef({
    isAnimating: false,
    startTime: -1,
    startProgress: 0,
    duration: 1.5
  })
  const dragMeshRef = useRef()

  const currentPhaseTime = useMemo(() => {
    return checkpoints[activeIndex]?.overrideTime !== undefined 
      ? checkpoints[activeIndex].overrideTime 
      : (lighting?.time || 12);
  }, [activeIndex, checkpoints, lighting?.time]);

  // Editör modunda belirli bir sahneye atlamak için event dinleyici
  useEffect(() => {
    const handleJump = (e) => {
      const idx = e.detail;
      const isTechnical = idx >= checkpoints.length;
      const cp = isTechnical ? technicalViews[idx - checkpoints.length] : checkpoints[idx];
      
      if (cp && orbitRef.current) {
        camera.up.set(...(cp.cameraUp || [0, 1, 0]));
        camera.position.set(...cp.cameraPos);
        orbitRef.current.target.set(...cp.lookAtPos);
        orbitRef.current.update();
        camera.updateProjectionMatrix();
      }
    };

    const handleZoom = (e) => {
      const factor = e.detail; // -1 zoom in, 1 zoom out
      setSessionZoom(prev => {
        const next = factor > 0 ? prev * 0.85 : prev * 1.15;
        return Math.max(0.01, Math.min(100, next));
      });
    };

    window.addEventListener('jumpToPhase', handleJump);
    window.addEventListener('zoomGallery', handleZoom);
    return () => {
      window.removeEventListener('jumpToPhase', handleJump);
      window.removeEventListener('zoomGallery', handleZoom);
    };
  }, [checkpoints, technicalViews, camera]);

  // Güneş Pozisyonunu (Gerçekçi olarak) hesapla
  const sunPos = useMemo(() => {
    if (!lighting) return [10, 20, 10];
    
    // Tarih ve Saati birleştir
    const dateObj = new Date(lighting.date || Date.now());
    const hours = Math.floor(currentPhaseTime);
    const minutes = Math.floor((currentPhaseTime % 1) * 60);
    dateObj.setHours(hours, minutes, 0);

    const lat = lighting?.latitude || 41.0082; // Varsayılan İstanbul
    const lng = lighting?.longitude || 28.9784;

    const { azimuth, altitude } = SunCalc.getPosition(dateObj, lat, lng);
    
    // Vektör matematiği (Y yukarı, Z güney kabul edilir)
    const radius = Math.max(50, modelSize * 2);
    const y = radius * Math.sin(altitude);
    const hr = radius * Math.cos(altitude);
    const x = hr * -Math.sin(azimuth);
    const z = hr * Math.cos(azimuth);
    
    return [x, y, z];
  }, [lighting?.date, currentPhaseTime, lighting?.latitude, lighting?.longitude, modelSize]);

  // Gelişmiş Güneş Durumu Hesaplama (Atmosferik saçılma simülasyonu)
  const dateObjForStatic = new Date(lighting?.date || Date.now());
  const hoursForStatic = Math.floor(currentPhaseTime);
  const minsForStatic = Math.floor((currentPhaseTime % 1) * 60);
  dateObjForStatic.setHours(hoursForStatic, minsForStatic, 0);
  const { azimuth: staticAz, altitude: staticAlt } = SunCalc.getPosition(dateObjForStatic, lighting?.latitude || 41.0082, lighting?.longitude || 28.9784);
  
  const sinAlt = Math.sin(staticAlt);
  const sunHeightRatio = Math.max(0, sinAlt);
  
  // Atmosfer yoğunluğu: Güneş düşükken ışık daha fazla engellenir
  const atmosphericFactor = THREE.MathUtils.smoothstep(sinAlt, -0.05, 0.4);
  const ambientFactor = Math.max(0.02, Math.pow(sunHeightRatio, 0.4));

  const staticSunColor = useMemo(() => {
    const color = new THREE.Color();
    if (sinAlt < 0.15) {
      // Şafak: Kırmızıdan altına
      color.lerpColors(DUSK_COLOR, SUNRISE_COLOR, Math.max(0, sinAlt + 0.1) / 0.25);
    } else {
      // Gündüz: Altından beyaza
      color.lerpColors(SUNRISE_COLOR, NOON_COLOR, (sinAlt - 0.15) / 0.6);
    }
    return color;
  }, [sinAlt]);

  // Sky Parametreleri
  const skyParams = useMemo(() => {
    return {
      turbidity: 10 - (sunHeightRatio * 8), // Öğlen daha berrak gökyüzü
      rayleigh: 1 + (1 - sunHeightRatio) * 3, // Sabahları daha fazla saçılma (kırmızılık)
      mieCoefficient: 0.005 + (1 - sunHeightRatio) * 0.05,
      mieDirectionalG: 0.8
    }
  }, [sunHeightRatio]);

  // Otomatik gökyüzü teması (Environment Preset) belirleme
  const autoEnvPreset = useMemo(() => {
    const userPreset = lighting?.envPreset || 'auto';
    if (userPreset !== 'auto') return userPreset;
    
    const hours = currentPhaseTime;
    
    if (sunPos[1] <= -2) return 'night'; // Gece
    
    if (sunPos[1] > -2 && sunPos[1] <= 15) {
      // Sabah 12'den önceyse şafak vakti, sonraysa gün batımı
      return hours < 12 ? 'dawn' : 'sunset';
    }
    
    return 'city'; // Gündüz (Öğle vakti)
  }, [sunPos, currentPhaseTime, lighting?.envPreset]);

  // Sadece yeni bir nokta seçildiğinde gizli mesh'i o koordinata ışınlarız.
  // Sürükleme (drag) sırasında React'ın bu mesh'e müdahale etmesini engelleriz.
  useEffect(() => {
    if (selectedPoint && checkpoints[selectedPoint.index] && dragMeshRef.current) {
      const pos = selectedPoint.type === 'camera'
        ? checkpoints[selectedPoint.index].cameraPos
        : checkpoints[selectedPoint.index].lookAtPos;
      dragMeshRef.current.position.set(...pos);
    }
  }, [selectedPoint])

  // activeIndex (faz) değiştiğinde, yeni bir animasyon başlatırız.
  useEffect(() => {
    if (editorMode || isGalleryPhase) {
      // Editör modunda veya Galeri fazında doğrudan hedefe atla
      progressRef.current = checkpoints.length > 1 ? activeIndex / (checkpoints.length - 1) : 0
      
      // Galeri fazında anında kamerayı konumlandır (animasyonsuz)
      if (activeCp) {
        camera.up.set(...(activeCp.cameraUp || [0, 1, 0]));
        camera.position.set(...activeCp.cameraPos);
        if (orbitRef.current) {
          orbitRef.current.target.set(...activeCp.lookAtPos);
          orbitRef.current.update();
          // Reset orbit control internal rotation state
          orbitRotationRef.current.copy(camera.quaternion);
        } else {
          camera.lookAt(...activeCp.lookAtPos);
        }
        camera.updateProjectionMatrix();
      }
      return
    }
    transitionRef.current = {
      isAnimating: true,
      startTime: -1,
      startProgress: progressRef.current,
      duration: checkpoints[activeIndex]?.duration || 1.5
    }
  }, [activeIndex, checkpoints.length, editorMode, isGalleryPhase, activeCp, camera])

  // Generate curves for camera position and lookAt target based on checkpoints
  const { camCurve, targetCurve } = useMemo(() => {
    if (checkpoints.length < 2) return { camCurve: null, targetCurve: null }
    
    const camPoints = checkpoints.map(cp => new THREE.Vector3(...cp.cameraPos))
    const targetPoints = checkpoints.map(cp => new THREE.Vector3(...cp.lookAtPos))
    
    const camCurve = new THREE.CatmullRomCurve3(camPoints, false, 'centripetal', 0.5)
    const targetCurve = new THREE.CatmullRomCurve3(targetPoints, false, 'centripetal', 0.5)
    
    return { camCurve, targetCurve }
  }, [checkpoints])

  useFrame((state, delta) => {
    const targetProgress = checkpoints.length > 1 ? activeIndex / (checkpoints.length - 1) : 0;
    
    // 1. Animasyon İlerleme Durumu
    if (!editorMode && transitionRef.current.isAnimating) {
      if (transitionRef.current.startTime === -1) {
        transitionRef.current.startTime = state.clock.elapsedTime;
      }
      const now = state.clock.elapsedTime;
      const { startTime, startProgress, duration } = transitionRef.current;
      let progressRatio = duration > 0 ? (now - startTime) / duration : 1;
      
      if (progressRatio >= 1) {
        progressRatio = 1;
        transitionRef.current.isAnimating = false;
      }
      
      const ease = progressRatio < 0.5 
        ? 4 * progressRatio * progressRatio * progressRatio 
        : 1 - Math.pow(-2 * progressRatio + 2, 3) / 2;
        
      progressRef.current = THREE.MathUtils.lerp(startProgress, targetProgress, ease);
    } else if (editorMode) {
      progressRef.current = targetProgress;
    }

    const t = progressRef.current;
    const activeCp = checkpoints[activeIndex];

    // 2. KRİTİK LENS GÜNCELLEMESİ
    if (activeCp) {
      // Near/Far ayarları - Clipping sorunlarını önlemek için geniş tutuyoruz
      camera.near = isOrtho ? -20000 : 0.01;
      camera.far = 20000;

      if (editorMode || isGalleryPhase || !transitionRef.current.isAnimating) {
        if (isOrtho) {
          // Paralel izdüşümde görsel ölçeği mesafe ile eşle + Kullanıcı zoom çarpanı + Session zoom
          const dist = camera.position.distanceTo(orbitRef.current?.target || new THREE.Vector3());
          camera.zoom = sessionZoom * (activeCp.zoom || 1) / (Math.max(dist, 0.001) * 0.4142);
        } else {
          camera.zoom = 1;
        }
        camera.updateProjectionMatrix();
      }
    }

    // 3. Kamera Pozisyonu ve Bakış Açısı (Sadece Sinematik Modda ve Galeri Harici)
    if (!editorMode && !isGalleryPhase) {
      let pos = new THREE.Vector3(0, 5, 20);
      let targetQuat = new THREE.Quaternion();
      let currentLerpTime = currentPhaseTime;

      if (checkpoints.length > 1 && camCurve) {
        const segmentFloat = t * (checkpoints.length - 1);
        let startIndex = Math.floor(segmentFloat);
        let endIndex = Math.ceil(segmentFloat);
        if (startIndex >= checkpoints.length) startIndex = checkpoints.length - 1;
        if (endIndex >= checkpoints.length) endIndex = checkpoints.length - 1;
        
        const pStart = checkpoints[startIndex];
        const pEnd = checkpoints[endIndex];
        const segmentLocalT = startIndex === endIndex ? 0 : (segmentFloat - startIndex);

        // Zaman interpolasyonu
        const timeStart = pStart.overrideTime !== undefined ? pStart.overrideTime : (lighting?.time || 12);
        const timeEnd = pEnd.overrideTime !== undefined ? pEnd.overrideTime : (lighting?.time || 12);
        currentLerpTime = THREE.MathUtils.lerp(timeStart, timeEnd, segmentLocalT);

        // Pozisyon ve Hedef
        pos = camCurve.getPoint(t);
        const lookAtPos = targetCurve.getPoint(t);

        // Quaternion
        const dummyCam = new THREE.PerspectiveCamera();
        
        // pStart için yönelim
        dummyCam.up.set(...(pStart.cameraUp || [0, 1, 0]));
        dummyCam.position.set(...(pStart.cameraPos || [0, 5, 20]));
        dummyCam.lookAt(...(pStart.lookAtPos || [0, 0, 0]));
        const qStart = dummyCam.quaternion.clone();
        
        // pEnd için yönelim
        dummyCam.up.set(...(pEnd.cameraUp || [0, 1, 0]));
        dummyCam.position.set(...(pEnd.cameraPos || [0, 5, 20]));
        dummyCam.lookAt(...(pEnd.lookAtPos || [0, 0, 0]));
        const qEnd = dummyCam.quaternion.clone();

        targetQuat.slerpQuaternions(qStart, qEnd, segmentLocalT);

        // Lens interpolasyonu (Animasyon sırasında Zoom geçişi)
        if (transitionRef.current.isAnimating) {
          const isOrtho = pEnd.isOrtho; // Hedef fazın projeksiyon tipini baz al
          if (isOrtho) {
             const dist = pos.distanceTo(lookAtPos);
             camera.zoom = (pEnd.zoom || 1) / (Math.max(dist, 0.01) * 0.4142);
          } else {
             camera.zoom = 1;
          }
          camera.updateProjectionMatrix();
        }
      } else if (checkpoints.length > 0) {
        const pSingle = checkpoints[0];
        pos.set(...(pSingle.cameraPos || [0, 5, 20]));
        const lookAtPos = new THREE.Vector3(...(pSingle.lookAtPos || [0, 0, 0]));
        const dummyCam = new THREE.PerspectiveCamera();
        dummyCam.position.copy(pos);
        dummyCam.lookAt(lookAtPos);
        targetQuat.copy(dummyCam.quaternion);
        
        if (pSingle.isOrtho) {
          camera.zoom = (pSingle.zoom || 1) / (Math.max(pos.distanceTo(lookAtPos), 0.01) * 0.4142);
          camera.updateProjectionMatrix();
        }
      }

      camera.position.copy(pos);
      camera.quaternion.copy(targetQuat);

      if (overlayRef.current) {
        overlayRef.current.position.copy(pos);
        overlayRef.current.quaternion.copy(targetQuat);
        overlayRef.current.translateZ(-3);
      }

      // 4. Dinamik Işık Güncellemesi (Sadece Animasyon Sırasında)
      if (transitionRef.current.isAnimating) {
        const dateObj = new Date(lighting?.date || Date.now());
        const hours = Math.floor(currentLerpTime);
        const minutes = Math.floor((currentLerpTime % 1) * 60);
        dateObj.setHours(hours, minutes, 0);

        const { azimuth, altitude } = SunCalc.getPosition(dateObj, lighting?.latitude || 41.0082, lighting?.longitude || 28.9784);
        const radius = Math.max(50, (useStore.getState().modelSize || 100) * 2);
        const y = radius * Math.sin(altitude);
        const hr = radius * Math.cos(altitude);
        const dynamicSunPos = new THREE.Vector3(hr * -Math.sin(azimuth), y, hr * Math.cos(azimuth));
        
        const sinAlt = Math.sin(altitude);
        const sunHeightRatio = Math.max(0, sinAlt);
        const atmosphericFactor = THREE.MathUtils.smoothstep(sinAlt, -0.05, 0.4);
        const dynamicAmbientFactor = Math.max(0.02, Math.pow(sunHeightRatio, 0.4));
        
        const dynamicColor = new THREE.Color();
        if (sinAlt < 0.15) {
          dynamicColor.lerpColors(DUSK_COLOR, SUNRISE_COLOR, Math.max(0, sinAlt + 0.1) / 0.25);
        } else {
          dynamicColor.lerpColors(SUNRISE_COLOR, NOON_COLOR, (sinAlt - 0.15) / 0.6);
        }

        if (dirLightRef.current) {
          dirLightRef.current.position.copy(dynamicSunPos);
          dirLightRef.current.intensity = atmosphericFactor * (lighting?.sunIntensity || 2.5);
          dirLightRef.current.color.copy(dynamicColor);
          dirLightRef.current.updateMatrixWorld();
        }
        if (ambientLightRef.current) {
          ambientLightRef.current.intensity = (lighting?.ambientIntensity || 0.5) * dynamicAmbientFactor;
        }
        if (skyRef.current?.material?.uniforms) {
          const uniforms = skyRef.current.material.uniforms;
          uniforms.sunPosition.value.copy(dynamicSunPos);
          uniforms.turbidity.value = 10 - (sunHeightRatio * 8);
          uniforms.rayleigh.value = 1 + (1 - sunHeightRatio) * 3;
          uniforms.mieCoefficient.value = 0.005 + (1 - sunHeightRatio) * 0.05;
          skyRef.current.material.uniformsNeedUpdate = true;
        }
        state.scene.environmentIntensity = dynamicAmbientFactor;
      }
    }
  })

  // To allow adding a checkpoint, we need a way to get current camera pos and lookAt
  // We attach it to window for the UI to read
  useFrame(() => {
    if (editorMode && orbitRef.current) {
      window.currentCameraPos = camera.position.toArray()
      window.currentLookAt = orbitRef.current.target.toArray()
    }
  })

  return (
    <>
      {/* Dinamik Kamera Sistemi */}
      <PerspectiveCamera 
        makeDefault={!isOrtho} 
        fov={45} 
        near={0.01} 
        far={20000} 
      />
      <OrthographicCamera 
        makeDefault={isOrtho} 
        near={-20000} 
        far={20000} 
      />

      <color attach="background" args={['#111214']} />
      <Sky 
        ref={skyRef} 
        sunPosition={sunPos} 
        turbidity={skyParams.turbidity} 
        rayleigh={skyParams.rayleigh} 
        mieCoefficient={skyParams.mieCoefficient} 
        mieDirectionalG={skyParams.mieDirectionalG} 
        distance={450000} 
      />
      <ambientLight ref={ambientLightRef} intensity={(lighting?.ambientIntensity || 0.5) * ambientFactor} />
      <hemisphereLight intensity={0.5} skyColor="#ffffff" groundColor="#000000" />
      <directionalLight 
        ref={dirLightRef}
        castShadow 
        position={sunPos} 
        intensity={sunHeightRatio * (lighting?.sunIntensity || 2.5)} 
        color={staticSunColor}
        shadow-mapSize={[4096, 4096]} 
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      >
        <orthographicCamera 
          attach="shadow-camera" 
          args={[-modelSize * 5, modelSize * 5, modelSize * 5, -modelSize * 5, 0.1, modelSize * 10]} 
        />
        <primitive object={new THREE.Object3D()} attach="target" position={[0, 0, 0]} />
      </directionalLight>
      <Environment 
        preset={autoEnvPreset} 
        background={false} 
        blur={0.8} 
        environmentIntensity={ambientFactor * 0.8}
      />

      <ContactShadows 
        position={[0, -0.01, 0]} 
        opacity={0.6} 
        scale={modelSize * 4} 
        blur={1.5} 
        far={10} 
        resolution={2048} 
        color="#000000" 
      />
      
      {/* Klavye ile Gezinme (WASD + Space) */}
      <KeyboardFly orbitRef={orbitRef} />


      {/* Editor Modunda Izgara (Zemini hizalamak ve ölçeği hissetmek için) */}
      {editorMode && showHelpers && (
        <Grid 
          position={[0, -0.07, 0]} 
          args={[modelSize * 20, modelSize * 20]} 
          cellSize={Math.max(1, modelSize / 50)} 
          cellThickness={0.5} 
          cellColor="#555" 
          sectionSize={Math.max(5, modelSize / 10)} 
          sectionThickness={1} 
          sectionColor="#888" 
          fadeDistance={modelSize * 20} 
          fadeStrength={1} 
        />
      )}
      
      {(editorMode || isGalleryPhase) && (
        <OrbitControls 
          ref={orbitRef} 
          makeDefault 
          enableDamping={false} 
          enableZoom={editorMode} 
          panSpeed={activeCp?.isOrtho || isGalleryPhase ? 2 : 1}
          screenSpacePanning={true}
          onStart={() => {
            isInteractingRef.current = true;
            orbitRotationRef.current.copy(camera.quaternion);
          }}
          onEnd={() => {
            isInteractingRef.current = false;
          }}
          onChange={() => {
            if (isInteractingRef.current && !isGalleryPhase && orbitRef.current && editorMode) {
              const angle = camera.quaternion.angleTo(orbitRotationRef.current);
              if (angle > 0.01) {
                // ...
              }
            }
          }}
        />
      )}
      
      <group onPointerDown={handlePointerDown}>
        {modelUrl ? <CustomModel /> : <MockArchitecture />}
      </group>
      
      <VideoTextOverlay overlayRef={overlayRef} />
      
      {/* Ground reflections */}
      {!editorMode && (
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[modelSize * 6, modelSize * 6]} />
          <MeshReflectorMaterial
            resolution={1024}
            mirror={0.6}
            mixBlur={12}
            mixStrength={1.2}
            blur={[400, 100]}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#08090a"
            metalness={0.9}
            roughness={0.15}
          />
        </mesh>
      )}
      {/* Visualize the camera path and editor controls */}
      {editorMode && showHelpers && (
        <group onPointerMissed={() => setSelectedPoint(null)}>
          {camCurve && (
            <Line 
              points={camCurve.getPoints(128)} 
              color="yellow" 
              lineWidth={3}
              transparent
              opacity={0.6}
            />
          )}
          
          {checkpoints.map((cp, i) => (
            <React.Fragment key={`cp-${i}`}>
              {/* Connecting line */}
              <Line points={[cp.cameraPos, cp.lookAtPos]} color="rgba(255,255,255,0.2)" dashed />
              
              {/* Camera Point - Hide if it's the active one being edited to prevent blocking the view */}
              {activeIndex !== i && (
                <Sphere 
                  args={[cp.isTransit ? 0.15 : 0.3]} 
                  position={cp.cameraPos} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (selectedPoint?.index !== i || selectedPoint?.type !== 'camera') {
                      setSelectedPoint({ index: i, type: 'camera' });
                    }
                  }}
                >
                  <meshBasicMaterial color={selectedPoint?.index === i && selectedPoint?.type === 'camera' ? "yellow" : cp.isTransit ? "white" : i === 0 ? "green" : i === checkpoints.length - 1 ? "red" : "blue"} />
                </Sphere>
              )}

              {/* LookAt Point - Also hide active to prevent occlusion */}
              {activeIndex !== i && (
                <Sphere 
                  args={[0.2]} 
                  position={cp.lookAtPos} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (selectedPoint?.index !== i || selectedPoint?.type !== 'lookAt') {
                      setSelectedPoint({ index: i, type: 'lookAt' });
                    }
                  }}
                >
                  <meshBasicMaterial color={selectedPoint?.index === i && selectedPoint?.type === 'lookAt' ? "yellow" : cp.isTransit ? "gray" : "orange"} transparent opacity={0.8} />
                </Sphere>
              )}
            </React.Fragment>
          ))}

          {/* Single Global PivotControls to prevent WebGL/TransformControls crashes */}
          {selectedPoint && checkpoints[selectedPoint.index] && (
            <PivotControls 
              autoTransform={false}
              matrix={new THREE.Matrix4().setPosition(
                ...(selectedPoint.type === 'camera' 
                  ? checkpoints[selectedPoint.index].cameraPos 
                  : checkpoints[selectedPoint.index].lookAtPos)
              )}
              onDrag={(local, delta, world) => {
                const pos = new THREE.Vector3().setFromMatrixPosition(world)
                updateCheckpoint(selectedPoint.index, { 
                  [selectedPoint.type === 'camera' ? 'cameraPos' : 'lookAtPos']: pos.toArray() 
                })
              }}
              scale={2}
              depthTest={false}
              lineWidth={4}
            />
          )}
        </group>
      )}
    </>
  )
}

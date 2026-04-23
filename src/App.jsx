import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import Overlay from './components/Overlay'
import EditorUI from './components/EditorUI'
import { useStore } from './store'
import './index.css'

import * as THREE from 'three'

import { useState, useEffect } from 'react'

function App() {
  const { editorMode, setEditorMode, resetStore } = useStore()
  const [showRecovery, setShowRecovery] = useState(false)

  useEffect(() => {
    // Tarayıcı hafızasında kayıtlı veri var mı?
    const savedData = localStorage.getItem('storypro-v1')
    
    if (savedData) {
      // Verinin içi boş mu kontrol et (Zustand persist bazen boş obje bırakabilir)
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.state && parsed.state.checkpoints && parsed.state.checkpoints.length > 0) {
          setShowRecovery(true)
        }
      } catch (e) {
        console.error("Kayıtlı veri okunamadı:", e);
      }
    }
  }, [])

  const handleRecovery = (shouldRecover) => {
    if (!shouldRecover) {
      resetStore()
      localStorage.removeItem('storypro-v1')
    }
    setShowRecovery(false)
  }

  return (
    <div className="app-container">
      {/* 3D Canvas - fixed behind everything */}
      <div className="canvas-container">
        <Canvas 
          shadows 
          gl={{ 
            antialias: true, 
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
            logarithmicDepthBuffer: true
          }} 
          dpr={[1, 2]} 
          camera={{ position: [0, 5, 20], fov: 45, near: 0.1, far: 20000 }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* HTML Overlay for Scrollytelling */}
      <Overlay />

      {/* Editor UI */}
      {editorMode && <EditorUI />}

      {/* Recovery Modal */}
      {showRecovery && (
        <div className="recovery-overlay">
          <div className="recovery-modal">
            <h3>Kurtarılmış Proje Bulundu</h3>
            <p>Tarayıcı hafızasında üzerinde çalıştığınız bir proje tespit edildi. Bu projeye devam etmek ister misiniz?</p>
            <div className="recovery-actions">
              <button className="recovery-btn primary" onClick={() => handleRecovery(true)}>Evet, Devam Et</button>
              <button className="recovery-btn secondary" onClick={() => handleRecovery(false)}>Hayır, Yeni Proje Başlat</button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Editor Button (when not in editor mode) */}
      {!editorMode && !showRecovery && (
        <button 
          className="toggle-editor-btn"
          onClick={() => setEditorMode(true)}
        >
          ⚙️ Editör Moduna Geç
        </button>
      )}
    </div>
  )
}

export default App

import React, { useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function Overlay() {
  const { checkpoints, technicalViews, activeIndex, setActiveIndex, goToNextPhase, goToPrevPhase, editorMode, recordingMode } = useStore()
  const isAnimating = useRef(false)
  const scrollAccumulator = useRef(0)
  const lastTouchY = useRef(0)

  useEffect(() => {
    if (editorMode) return;

    const handleWheel = (e) => {
      if (editorMode) return;
      e.preventDefault();
      
      // Yön değişirse ivmeyi hemen sıfırla (Kullanıcı yukarı/aşağı karar değiştirdiğinde savaşmasın)
      if (e.deltaY > 0 && scrollAccumulator.current < 0) scrollAccumulator.current = 0;
      if (e.deltaY < 0 && scrollAccumulator.current > 0) scrollAccumulator.current = 0;
      
      // Y eksenindeki ivmeyi topla
      scrollAccumulator.current += e.deltaY;
      
      if (!isAnimating.current) {
        if (Math.abs(scrollAccumulator.current) > 50) {
          const oldIndex = useStore.getState().activeIndex
          
          if (scrollAccumulator.current > 0) {
            goToNextPhase()
          } else {
            goToPrevPhase()
          }
          
          const newIndex = useStore.getState().activeIndex
          
          // Sadece gerçekten durak değiştiyse animasyon kilitlenmesi yap
          if (oldIndex !== newIndex) {
            const duration = useStore.getState().checkpoints[newIndex]?.duration || 1.5
            
            isAnimating.current = true;
            setTimeout(() => {
              isAnimating.current = false;
              scrollAccumulator.current = 0; // Reset accumulator after animation
            }, duration * 1000 + 100); // Wait for the dynamic transition to settle
          } else {
            // En üstte veya en alttayız, ivmeyi sıfırla ama kilitleme
            scrollAccumulator.current = 0;
          }
        }
      }
    }

    const handleTouchStart = (e) => {
      lastTouchY.current = e.touches[0].clientY;
      scrollAccumulator.current = 0;
    }
    
    const handleTouchMove = (e) => {
      if (editorMode) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const deltaY = lastTouchY.current - touch.clientY;
      lastTouchY.current = touch.clientY; // Her zaman güncelle ki sıçrama olmasın
      
      if (isAnimating.current) return;
      
      // Yön değişirse ivmeyi hemen sıfırla
      if (deltaY > 0 && scrollAccumulator.current < 0) scrollAccumulator.current = 0;
      if (deltaY < 0 && scrollAccumulator.current > 0) scrollAccumulator.current = 0;
      
      scrollAccumulator.current += deltaY;
      
      if (Math.abs(scrollAccumulator.current) > 30) {
        const oldIndex = useStore.getState().activeIndex
        
        if (scrollAccumulator.current > 0) {
          goToNextPhase()
        } else {
          goToPrevPhase()
        }
        
        const newIndex = useStore.getState().activeIndex
        
        if (oldIndex !== newIndex) {
          const duration = useStore.getState().checkpoints[newIndex]?.duration || 1.5
          
          isAnimating.current = true;
          setTimeout(() => {
            isAnimating.current = false;
            scrollAccumulator.current = 0;
          }, duration * 1000 + 100);
        } else {
          scrollAccumulator.current = 0;
        }
      }
    }

    // passive: false is required to use e.preventDefault()
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('touchstart', handleTouchStart, { passive: false })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [goToNextPhase, goToPrevPhase, editorMode, recordingMode])

  if (editorMode) return null

  if (recordingMode === '3d') {
    return (
      <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', fontWeight: 'bold', zIndex: 1000, background: 'rgba(0,0,0,0.8)', padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '15px', height: '15px', background: '#ff4444', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
        🎥 Sadece 3D Video Render Alınıyor... Lütfen sayfadan ayrılmayın.
        <style>{`@keyframes pulse { 0% { opacity: 1 } 50% { opacity: 0.2 } 100% { opacity: 1 } }`}</style>
      </div>
    )
  }

  return (
    <div className="fixed-overlay">
      {/* Storyline Sahneleri */}
      {activeIndex < checkpoints.length && checkpoints.map((cp, i) => {
        if (cp.isTransit) return null;
        const isActive = i === activeIndex
        return (
          <div 
            key={cp.id} 
            className={`fixed-content ${isActive ? 'active' : ''}`}
          >
            <div className="checkpoint-content">
              <h2>{cp.title}</h2>
              <p>{cp.body}</p>
            </div>
          </div>
        )
      })}

      {/* Teknik Galeri Bölümü (Slide Mantığı) */}
      {activeIndex >= checkpoints.length && (
        <div className="technical-gallery-overlay active">
          <div className="gallery-header">
            <span className="gallery-badge">TEKNİK GÖRÜNÜŞLER</span>
            <div className="gallery-pagination">
              {activeIndex - checkpoints.length + 1} / {technicalViews.length}
            </div>
          </div>

          <div className="gallery-main-content">
            <div className="gallery-side-controls">
              <button className="gallery-nav-btn prev" onClick={goToPrevPhase}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              
              <div className="zoom-controls-vertical">
                <button className="zoom-btn" onClick={() => window.dispatchEvent(new CustomEvent('zoomGallery', { detail: -1 }))} title="YAKINLAŞ">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button className="zoom-btn" onClick={() => window.dispatchEvent(new CustomEvent('zoomGallery', { detail: 1 }))} title="UZAKLAŞ">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button className="zoom-btn" onClick={() => window.dispatchEvent(new CustomEvent('jumpToPhase', { detail: activeIndex }))} title="GÖRÜNÜŞÜ SIFIRLA">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                </button>
              </div>
            </div>

            <div className="gallery-info-card">
              <h3>{technicalViews[activeIndex - checkpoints.length]?.title}</h3>
              <p>{technicalViews[activeIndex - checkpoints.length]?.description}</p>
            </div>

            <button className="gallery-nav-btn next" onClick={goToNextPhase}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>

          <div className="gallery-thumbnails">
            {technicalViews.map((v, idx) => (
              <div 
                key={v.id} 
                className={`thumb-dot ${idx === activeIndex - checkpoints.length ? 'active' : ''}`}
                onClick={() => setActiveIndex(checkpoints.length + idx)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

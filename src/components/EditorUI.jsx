import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { 
  Plus, 
  Trash2, 
  Camera, 
  Sun, 
  Layers, 
  Video, 
  Settings, 
  ChevronRight, 
  ChevronDown, 
  MapPin, 
  Clock, 
  Calendar, 
  Upload, 
  Box, 
  Eye, 
  EyeOff,
  Palette,
  Play,
  Save,
  Download,
  X
} from 'lucide-react';
import JSZip from 'jszip';

const EditorUI = () => {
  const { 
    editorMode, setEditorMode,
    checkpoints, addCheckpoint, removeCheckpoint, updateCheckpoint,
    technicalViews, addTechnicalView, removeTechnicalView, updateTechnicalView,
    activeIndex, setActiveIndex,
    lighting, setLighting,
    showHelpers, setShowHelpers,
    modelUrl, setModelUrl,
    layerColors, setLayerColor,
    modelLayers
  } = useStore();

  const { date, time, envPreset } = lighting || {};

  const [activeTab, setActiveTab] = useState('scenes');
  const [expandedSections, setExpandedSections] = useState({
    general: true,
    camera: true,
    layers: true,
    sun: true,
    environment: true,
  });

  if (!editorMode) return null;

  // Sync lighting updates
  const setDate = (newDate) => setLighting({ date: newDate });
  const setTime = (newTime) => setLighting({ time: newTime });
  const setEnvironmentPreset = (newPreset) => setLighting({ envPreset: newPreset });

  const activeCheckpointIndex = activeIndex;
  const setActiveCheckpointIndex = setActiveIndex;
  const allLayers = modelLayers;

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCaptureCamera = (index) => {
    if (window.currentCameraPos && window.currentLookAt) {
      const isTechnical = index >= checkpoints.length;
      if (isTechnical) {
        updateTechnicalView(index - checkpoints.length, {
          cameraPos: [...window.currentCameraPos],
          lookAtPos: [...window.currentLookAt]
        });
      } else {
        updateCheckpoint(index, {
          cameraPos: [...window.currentCameraPos],
          lookAtPos: [...window.currentLookAt]
        });
      }
    } else {
      alert("Kamera verisi alınamadı. Lütfen sahneyi biraz hareket ettirin.");
    }
  };

  const handleSnap = (view, targetIdx, isTechnical = false) => {
    const target = window.currentLookAt || [0, 0, 0];
    const size = (useStore.getState().modelSize || 20) * 1.1;
    let newPos;
    
    switch(view) {
      case 'top': newPos = [target[0], target[1] + size, target[2]]; break;
      case 'front': newPos = [target[0], target[1], target[2] + size]; break;
      case 'side': newPos = [target[0] + size, target[1], target[2]]; break;
      default: return;
    }
    
    if (isTechnical) {
      updateTechnicalView(targetIdx, {
        cameraPos: newPos,
        lookAtPos: target,
      });
    } else {
      updateCheckpoint(targetIdx, {
        cameraPos: newPos,
        lookAtPos: target
      });
    }
    
    // Kamerayı anında o noktaya ışınla
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('jumpToPhase', { detail: activeIndex }));
    }, 50);
  };

  const handleDistanceChange = (val) => {
    const isTechnical = activeIndex >= checkpoints.length;
    const cp = isTechnical 
      ? technicalViews[activeIndex - checkpoints.length] 
      : checkpoints[activeIndex];
    
    if (!cp) return;
    
    const target = new THREE.Vector3(...(cp.lookAtPos || [0, 0, 0]));
    const pos = new THREE.Vector3(...(cp.cameraPos || [0, 5, 20]));
    const dir = new THREE.Vector3().subVectors(pos, target).normalize();
    
    if (dir.lengthSq() < 0.001) dir.set(0, 0.707, 0.707);
    
    const newPos = target.clone().add(dir.multiplyScalar(val));
    
    if (isTechnical) {
      updateTechnicalView(activeIndex - checkpoints.length, { cameraPos: newPos.toArray() });
    } else {
      updateCheckpoint(activeIndex, { cameraPos: newPos.toArray() });
    }
    
    window.dispatchEvent(new CustomEvent('jumpToPhase', { detail: activeIndex }));
  };

  const handleExport = async () => {
    const zip = new JSZip();
    const state = useStore.getState();
    
    const exportData = {
      checkpoints: state.checkpoints,
      technicalViews: state.technicalViews,
      lighting: state.lighting,
      layerColors: state.layerColors
    };
    
    zip.file("project.json", JSON.stringify(exportData, null, 2));

    if (modelUrl) {
      try {
        const response = await fetch(modelUrl);
        const blob = await response.blob();
        zip.file("model.glb", blob);
      } catch (err) {
        console.error("Model dosyası eklenemedi:", err);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyline_pro_project_${new Date().toISOString().slice(0,10)}.storypro`;
    link.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.storypro,.zip';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const zip = new JSZip();
      try {
        const contents = await zip.loadAsync(file);
        
        // Load JSON
        const jsonFile = contents.file("project.json");
        if (jsonFile) {
          const jsonText = await jsonFile.async("string");
          const data = JSON.parse(jsonText);
          if (data.checkpoints) useStore.setState({ checkpoints: data.checkpoints });
          if (data.technicalViews) useStore.setState({ technicalViews: data.technicalViews });
          if (data.lighting) useStore.setState({ lighting: data.lighting });
          if (data.layerColors) useStore.setState({ layerColors: data.layerColors });
        }

        // Load Model
        const modelFile = contents.file("model.glb");
        if (modelFile) {
          const modelBlob = await modelFile.async("blob");
          const modelUrl = URL.createObjectURL(modelBlob);
          setModelUrl(modelUrl);
        }

        alert("Proje dosyası başarıyla yüklendi.");
      } catch (err) {
        console.error("Yükleme hatası:", err);
        alert("Geçersiz proje dosyası.");
      }
    };
    input.click();
  };

  const SectionHeader = ({ id, icon: Icon, title, expanded, onToggle }) => (
    <div className={`section-header ${expanded ? 'expanded' : ''}`} onClick={() => onToggle(id)}>
      <div className="section-title">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {Icon && <Icon size={14} className="section-icon" />}
        <span>{title}</span>
      </div>
    </div>
  );

  return (
    <div className="editor-root">
      {/* INDUSTRY TOP TOOLBAR */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <div className="app-logo">
            <Box size={18} color="#ff5555" />
            <span>Storyline Pro</span>
          </div>
          <div className="toolbar-divider" />
          <nav className="toolbar-nav">
            <button className={activeTab === 'scenes' ? 'active' : ''} onClick={() => setActiveTab('scenes')}>
              <MapPin size={16} /> Sahneler
            </button>
            <button className={activeTab === 'views' ? 'active' : ''} onClick={() => setActiveTab('views')}>
              <Eye size={16} /> Görünüşler
            </button>
            <button className={activeTab === 'lighting' ? 'active' : ''} onClick={() => setActiveTab('lighting')}>
              <Sun size={16} /> Atmosfer
            </button>
            <button className={activeTab === 'layers' ? 'active' : ''} onClick={() => setActiveTab('layers')}>
              <Layers size={16} /> Katmanlar
            </button>
            <button className={activeTab === 'render' ? 'active' : ''} onClick={() => setActiveTab('render')}>
              <Video size={16} /> Render
            </button>
          </nav>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-btn secondary" onClick={handleImport} title="İçe Aktar">
            <Upload size={16} />
          </button>
          <button className="toolbar-btn secondary" onClick={handleExport} title="Dışa Aktar">
            <Save size={16} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-exit-btn" onClick={() => setEditorMode(false)}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* INDUSTRY INSPECTOR SIDEBAR */}
      <div className="editor-inspector">
        <div className="inspector-content">
          
          {activeTab === 'scenes' && (
            <div className="inspector-tab-pane">
              <div className="inspector-actions-bar">
                <button className="action-btn primary" onClick={() => {
                  const currentLen = checkpoints.length;
                  const newCp = {
                    id: `cp-${Date.now()}`,
                    title: `Sahne ${currentLen + 1}`,
                    body: "Bu sahne için bir açıklama girin...",
                    cameraPos: window.currentCameraPos || [0, 5, 20],
                    lookAtPos: window.currentLookAt || [0, 0, 0],
                    duration: 1.5,
                    hiddenLayers: [],
                    isOrtho: false,
                    cameraUp: [0, 1, 0]
                  };
                  addCheckpoint(newCp);
                  setActiveCheckpointIndex(currentLen);
                }}>
                  <Plus size={14} /> Yeni Sahne Ekle
                </button>
              </div>

              <div className="checkpoints-container">
                {checkpoints.map((cp, i) => (
                  <div key={cp.id} className={`scene-node ${activeCheckpointIndex === i ? 'active' : ''}`}>
                    <div className="scene-node-header" onClick={() => setActiveCheckpointIndex(i)}>
                      <div className="scene-number">{i + 1}</div>
                      <span className="scene-label">{cp.title || "İsimsiz Sahne"}</span>
                      <div className="scene-controls">
                        <button className="mini-icon-btn" onClick={(e) => { 
                          e.stopPropagation(); 
                          setActiveCheckpointIndex(i);
                          window.dispatchEvent(new CustomEvent('jumpToPhase', { detail: i }));
                        }} title="Sahneyi Gör">
                          <Eye size={12} />
                        </button>
                        <button className="mini-icon-btn" onClick={(e) => { e.stopPropagation(); removeCheckpoint(i); }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    
                    {activeCheckpointIndex === i && (
                      <div className="scene-node-body">
                        <div className="property-group">
                          <div className="property-row">
                            <label>Başlık</label>
                            <input 
                              type="text" 
                              value={cp.title} 
                              onChange={(e) => updateCheckpoint(i, { title: e.target.value })} 
                            />
                          </div>
                          <div className="property-row">
                            <label>Açıklama</label>
                            <textarea 
                              value={cp.description} 
                              onChange={(e) => updateCheckpoint(i, { description: e.target.value })} 
                            />
                          </div>
                        </div>

                        <SectionHeader 
                          id="camera" 
                          title="Kamera & Bakış" 
                          expanded={expandedSections.camera} 
                          onToggle={toggleSection} 
                        />
                        {expandedSections.camera && (
                          <div className="section-body">
                            <button className="property-btn-full" onClick={() => handleCaptureCamera(i)}>
                              <Camera size={14} /> Mevcut Açıyı Kaydet
                            </button>
                            <div className="property-row">
                              <label>Geçiş Süresi</label>
                              <div className="input-with-unit">
                                <input type="number" value={cp.duration || 1} onChange={(e) => updateCheckpoint(i, { duration: parseFloat(e.target.value) })} />
                                <span>sn</span>
                              </div>
                            </div>
                            <div className="help-text" style={{ fontSize: '10px', color: '#888', marginTop: '-4px', marginBottom: '8px' }}>
                              💡 <b>Option / Alt + Sol Tık:</b> Seçilen yüzeye dik hizalanır.
                            </div>
                            <div className="property-row">
                              <label>Bakış Mesafesi</label>
                              <div className="input-with-unit">
                                <input 
                                  type="number" 
                                  value={Math.round(new THREE.Vector3(...(cp.cameraPos || [0, 5, 20])).distanceTo(new THREE.Vector3(...(cp.lookAtPos || [0, 0, 0]))))} 
                                  onChange={(e) => handleDistanceChange(parseFloat(e.target.value))}
                                />
                                <span>m</span>
                              </div>
                            </div>
                            <div className="property-row" style={{ marginTop: '-10px' }}>
                              <input 
                                type="range" 
                                min="1" 
                                max="500" 
                                step="1" 
                                value={new THREE.Vector3(...(cp.cameraPos || [0, 5, 20])).distanceTo(new THREE.Vector3(...(cp.lookAtPos || [0, 0, 0])))} 
                                onChange={(e) => handleDistanceChange(parseFloat(e.target.value))} 
                              />
                            </div>

                            <div className="property-row" style={{ marginTop: '-10px' }}>
                              <input 
                                type="range" 
                                min="1" 
                                max="500" 
                                step="1" 
                                value={new THREE.Vector3(...(cp.cameraPos || [0, 5, 20])).distanceTo(new THREE.Vector3(...(cp.lookAtPos || [0, 0, 0])))} 
                                onChange={(e) => handleDistanceChange(parseFloat(e.target.value))} 
                              />
                            </div>
                          </div>
                        )}

                        <SectionHeader 
                          id="layers" 
                          title="Katman Görünürlüğü" 
                          expanded={expandedSections.layers} 
                          onToggle={toggleSection} 
                        />
                        {expandedSections.layers && (
                          <div className="section-body">
                            <div className="layers-visibility-grid">
                              {allLayers.map(layer => (
                                <button 
                                  key={layer}
                                  className={`layer-toggle-chip ${cp.hiddenLayers?.includes(layer) ? 'hidden' : ''}`}
                                  onClick={() => {
                                    const hidden = cp.hiddenLayers || [];
                                    const newHidden = hidden.includes(layer) 
                                      ? hidden.filter(l => l !== layer)
                                      : [...hidden, layer];
                                    updateCheckpoint(i, { hiddenLayers: newHidden });
                                  }}
                                >
                                  {cp.hiddenLayers?.includes(layer) ? <EyeOff size={10} /> : <Eye size={10} />}
                                  <span>{layer}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'views' && (
            <div className="inspector-tab-pane">
              <div className="inspector-actions-bar">
                <button className="action-btn primary" onClick={() => {
                  const newView = {
                    id: `view-${Date.now()}`,
                    title: `Görünüş ${technicalViews.length + 1}`,
                    description: "Teknik görünüş açıklaması...",
                    cameraPos: window.currentCameraPos || [0, 5, 20],
                    lookAtPos: window.currentLookAt || [0, 0, 0],
                    cameraUp: [0, 1, 0],
                    zoom: 1.0
                  };
                  addTechnicalView(newView);
                  setActiveCheckpointIndex(checkpoints.length + technicalViews.length);
                }}>
                  <Plus size={14} /> Yeni Teknik Görünüş
                </button>
              </div>

              <div className="checkpoints-container">
                {technicalViews.map((view, i) => {
                  const globalIdx = checkpoints.length + i;
                  return (
                    <div key={view.id} className={`scene-node ${activeCheckpointIndex === globalIdx ? 'active' : ''}`}>
                      <div className="scene-node-header" onClick={() => setActiveCheckpointIndex(globalIdx)}>
                        <div className="scene-number">V{i + 1}</div>
                        <span className="scene-label">{view.title || "İsimsiz Görünüş"}</span>
                        <div className="scene-controls">
                          <button className="mini-icon-btn" onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveCheckpointIndex(globalIdx);
                            window.dispatchEvent(new CustomEvent('jumpToPhase', { detail: globalIdx }));
                          }} title="Görünüşü Gör">
                            <Eye size={12} />
                          </button>
                          <button className="mini-icon-btn" onClick={(e) => { e.stopPropagation(); removeTechnicalView(i); }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      
                      {activeCheckpointIndex === globalIdx && (
                        <div className="scene-node-body">
                          <div className="property-group">
                            <div className="property-row">
                              <label>Başlık</label>
                              <input 
                                type="text" 
                                value={view.title} 
                                onChange={(e) => updateTechnicalView(i, { title: e.target.value })} 
                              />
                            </div>
                            <div className="property-row">
                              <label>Açıklama</label>
                              <textarea 
                                value={view.description} 
                                onChange={(e) => updateTechnicalView(i, { description: e.target.value })} 
                              />
                            </div>
                          </div>

                          <div className="property-group">
                            <div className="property-row">
                              <label>Zoom (Ölçek)</label>
                              <div className="input-with-unit">
                                <input 
                                  type="number" 
                                  step="0.1" 
                                  value={view.zoom || 1} 
                                  onChange={(e) => updateTechnicalView(i, { zoom: parseFloat(e.target.value) })} 
                                />
                                <span>x</span>
                              </div>
                            </div>
                            <div className="property-row" style={{ marginTop: '-10px' }}>
                              <input 
                                type="range" 
                                min="0.1" 
                                max="10" 
                                step="0.05" 
                                value={view.zoom || 1} 
                                onChange={(e) => updateTechnicalView(i, { zoom: parseFloat(e.target.value) })} 
                              />
                            </div>
                          </div>

                          <div className="property-group no-margin">
                            <div className="property-row">
                              <label>Hızlı Hizalama</label>
                              <div className="view-snap-grid">
                                <button className="snap-btn" onClick={() => handleSnap('top', i, true)}>Plan</button>
                                <button className="snap-btn" onClick={() => handleSnap('front', i, true)}>Ön</button>
                                <button className="snap-btn" onClick={() => handleSnap('side', i, true)}>Yan</button>
                              </div>
                            </div>
                            <button className="property-btn-full" onClick={() => {
                              updateTechnicalView(i, {
                                cameraPos: [...window.currentCameraPos],
                                lookAtPos: [...window.currentLookAt]
                              });
                            }}>
                              <Camera size={14} /> Mevcut Açıyı Kaydet
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'lighting' && (
            <div className="inspector-tab-pane padding-md">
              <SectionHeader 
                id="sun" 
                title="Güneş ve Zaman" 
                expanded={expandedSections.sun} 
                onToggle={toggleSection} 
              />
              {expandedSections.sun && (
                <div className="section-body no-padding">
                  <div className="property-row">
                    <div className="prop-label"><Clock size={12} /> Saat</div>
                    <input type="range" min="0" max="23.9" step="0.1" value={time} onChange={(e) => setTime(parseFloat(e.target.value))} />
                    <span className="prop-value">{Math.floor(time)}:{Math.floor((time % 1) * 60).toString().padStart(2, '0')}</span>
                  </div>
                  <div className="property-row">
                    <div className="prop-label"><Calendar size={12} /> Tarih</div>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="property-row">
                    <div className="prop-label">Konum Ön Ayarı</div>
                    <select onChange={(e) => {
                      const presets = {
                        istanbul: { lat: 41.0082, lng: 28.9784 },
                        london: { lat: 51.5074, lng: -0.1278 },
                        newyork: { lat: 40.7128, lng: -74.0060 },
                        dubai: { lat: 25.2048, lng: 55.2708 },
                        tokyo: { lat: 35.6762, lng: 139.6503 }
                      };
                      const city = presets[e.target.value];
                      if (city) setLighting({ latitude: city.lat, longitude: city.lng });
                    }}>
                      <option value="">Şehir Seçin...</option>
                      <option value="istanbul">İstanbul</option>
                      <option value="london">Londra</option>
                      <option value="newyork">New York</option>
                      <option value="dubai">Dubai</option>
                      <option value="tokyo">Tokyo</option>
                    </select>
                  </div>
                  <div className="property-row">
                    <div className="prop-label"><MapPin size={12} /> Enlem (Lat)</div>
                    <input type="number" step="0.0001" value={lighting?.latitude || 41.0082} onChange={(e) => setLighting({ latitude: parseFloat(e.target.value) })} />
                  </div>
                  <div className="property-row">
                    <div className="prop-label"><MapPin size={12} /> Boylam (Lng)</div>
                    <input type="number" step="0.0001" value={lighting?.longitude || 28.9784} onChange={(e) => setLighting({ longitude: parseFloat(e.target.value) })} />
                  </div>
                </div>
              )}

              <SectionHeader 
                id="environment" 
                title="Çevre ve Gökyüzü" 
                expanded={expandedSections.environment} 
                onToggle={toggleSection} 
              />
              {expandedSections.environment && (
                <div className="section-body no-padding">
                  <div className="property-row">
                    <div className="prop-label">Tema</div>
                    <select value={envPreset} onChange={(e) => setEnvironmentPreset(e.target.value)}>
                      <option value="city">Şehir (Modern)</option>
                      <option value="park">Park (Doğal)</option>
                      <option value="forest">Orman (Vahşi)</option>
                      <option value="apartment">İç Mekan</option>
                      <option value="studio">Stüdyo (Nötr)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'layers' && (
            <div className="inspector-tab-pane padding-md">
              <div className="property-group">
                <div className="prop-title"><Box size={14} /> 3D Model</div>
                <div className="model-upload-zone">
                  <Upload size={20} />
                  <p>Yeni .GLB / .GLTF sürükleyin</p>
                  <input type="file" accept=".glb,.gltf" onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) setModelUrl(URL.createObjectURL(file));
                  }} />
                </div>
              </div>

              <div className="property-group">
                <div className="prop-title"><Palette size={14} /> Materyal Boyama</div>
                <div className="material-list">
                  {allLayers.map(layer => (
                    <div key={layer} className="material-row">
                      <span className="material-name">{layer}</span>
                      <div className="material-controls">
                        <input 
                          type="color" 
                          value={layerColors[layer] || '#ffffff'} 
                          onChange={e => setLayerColor(layer, e.target.value)} 
                        />
                        <button className="mini-icon-btn" onClick={() => setLayerColor(layer, null)}>
                          <Clock size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'render' && (
            <div className="inspector-tab-pane padding-md">
              <div className="render-setup">
                <div className="render-preview-box">
                   <Video size={32} color="rgba(255,255,255,0.2)" />
                   <span>Render Motoru Hazır</span>
                </div>
                
                <div className="property-row">
                  <label>Kılavuz Çizgileri</label>
                  <div className="toggle-switch">
                    <input type="checkbox" checked={showHelpers} onChange={(e) => setShowHelpers(e.target.checked)} />
                  </div>
                </div>

                <div className="render-actions-large">
                  <button className="render-large-btn video">
                    <Play size={16} /> 3D Video Çıktısı
                  </button>
                  <button className="render-large-btn cinematic">
                    <Video size={16} /> Tam Sinematik Render
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditorUI;

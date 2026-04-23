import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set) => ({
  recordingMode: 'none',
  setRecordingMode: (mode) => set({ recordingMode: mode }),
  editorMode: false,
  setEditorMode: (editorMode) => set({ editorMode }),
  modelUrl: null,
  setModelUrl: (url) => set({ modelUrl: url }),
  modelLayers: [],
  setModelLayers: (layers) => set({ modelLayers: layers }),
  modelSize: 20,
  setModelSize: (size) => set({ modelSize: size }),
  
  showHelpers: true,
  setShowHelpers: (show) => set({ showHelpers: show }),
  
  layerColors: {},
  setLayerColor: (layer, color) => set((state) => {
    const newColors = { ...state.layerColors };
    if (color === null) delete newColors[layer];
    else newColors[layer] = color;
    return { layerColors: newColors };
  }),
  
  lighting: {
    sunIntensity: 2.5,
    ambientIntensity: 0.5,
    envPreset: 'auto',
    latitude: 41.0082, // İstanbul varsayılan
    longitude: 28.9784,
    date: new Date().toISOString().split('T')[0],
    time: 12.0
  },
  setLighting: (data) => set((state) => ({ lighting: { ...state.lighting, ...data } })),
  
  technicalViews: [],
  addTechnicalView: (view) => set((state) => ({ technicalViews: [...state.technicalViews, view] })),
  removeTechnicalView: (index) => set((state) => ({
    technicalViews: state.technicalViews.filter((_, i) => i !== index)
  })),
  updateTechnicalView: (index, data) => set((state) => {
    const newViews = [...state.technicalViews];
    newViews[index] = { ...newViews[index], ...data };
    return { technicalViews: newViews };
  }),
  
  activeIndex: 0,
  setActiveIndex: (index) => set((state) => {
    const max = state.checkpoints.length + state.technicalViews.length - 1;
    const clamped = Math.max(0, Math.min(max, index));
    return { activeIndex: clamped };
  }),
  goToNextPhase: () => set((state) => {
    let nextIndex = state.activeIndex + 1;
    const total = state.checkpoints.length + state.technicalViews.length;
    if (nextIndex >= total) return state;
    return { activeIndex: nextIndex };
  }),
  goToPrevPhase: () => set((state) => {
    let prevIndex = state.activeIndex - 1;
    if (prevIndex < 0) return state;
    return { activeIndex: prevIndex };
  }),
  checkpoints: [
    {
      id: "step-1",
      cameraPos: [0, 5, 20],
      lookAtPos: [0, 0, 0],
      title: "Ana Sahne",
      body: "Mimari modele uzaktan bir bakış.",
      duration: 1.5,
      hiddenLayers: [],
      clayMode: false
    }
  ],
  addCheckpoint: (checkpoint) => set((state) => ({ checkpoints: [...state.checkpoints, checkpoint] })),
  updateCheckpoint: (index, data) => set((state) => {
    const newCheckpoints = [...state.checkpoints];
    newCheckpoints[index] = { ...newCheckpoints[index], ...data };
    return { checkpoints: newCheckpoints };
  }),
  removeCheckpoint: (index) => set((state) => ({
    checkpoints: state.checkpoints.filter((_, i) => i !== index)
  })),
  moveCheckpointUp: (index) => set((state) => {
    if (index === 0) return state;
    const newCheckpoints = [...state.checkpoints];
    const temp = newCheckpoints[index];
    newCheckpoints[index] = newCheckpoints[index - 1];
    newCheckpoints[index - 1] = temp;
    return { checkpoints: newCheckpoints };
  }),
  moveCheckpointDown: (index) => set((state) => {
    if (index === state.checkpoints.length - 1) return state;
    const newCheckpoints = [...state.checkpoints];
    const temp = newCheckpoints[index];
    newCheckpoints[index] = newCheckpoints[index + 1];
    newCheckpoints[index + 1] = temp;
    return { checkpoints: newCheckpoints };
  }),
  importCheckpoints: (checkpoints) => set({ checkpoints }),
  resetStore: () => set({
    checkpoints: [
      {
        id: "step-1",
        cameraPos: [0, 5, 20],
        lookAtPos: [0, 0, 0],
        title: "Ana Sahne",
        body: "Mimari modele uzaktan bir bakış.",
        duration: 1.5,
        hiddenLayers: [],
        clayMode: false
      }
    ],
    technicalViews: [],
    layerColors: {},
    lighting: {
      sunIntensity: 2.5,
      ambientIntensity: 0.5,
      envPreset: 'auto',
      latitude: 41.0082,
      longitude: 28.9784,
      date: new Date().toISOString().split('T')[0],
      time: 12.0
    },
    modelUrl: null,
    modelLayers: [],
    activeIndex: 0
  })
    }),
    {
      name: 'storypro-v1',
      partialize: (state) => ({ 
        checkpoints: state.checkpoints,
        technicalViews: state.technicalViews,
        layerColors: state.layerColors,
        lighting: state.lighting
      }),
    }
  )
)

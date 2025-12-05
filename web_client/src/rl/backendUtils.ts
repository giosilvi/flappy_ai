/**
 * TensorFlow.js Backend Detection and Initialization Utilities
 * Auto-detects the best available backend for the user's hardware
 */

import * as tf from '@tensorflow/tfjs'

export type BackendType = 'webgpu' | 'webgl' | 'cpu'

export interface BackendInfo {
  name: BackendType
  displayName: string
  isGPU: boolean
}

const BACKEND_INFO: Record<BackendType, BackendInfo> = {
  webgpu: { name: 'webgpu', displayName: 'WebGPU', isGPU: true },
  webgl: { name: 'webgl', displayName: 'WebGL', isGPU: true },
  cpu: { name: 'cpu', displayName: 'CPU', isGPU: false },
}

/**
 * Initialize TensorFlow.js with the best available backend
 * Priority: WebGPU > WebGL > CPU
 * 
 * @param preferred - Optional preferred backend to try first
 * @returns The name of the initialized backend
 */
export async function initBestBackend(
  preferred: BackendType | 'auto' = 'auto'
): Promise<BackendInfo> {
  // If a specific backend is preferred, try it first
  if (preferred !== 'auto') {
    const success = await trySetBackend(preferred)
    if (success) {
      console.log(`[TF.js] Initialized with preferred backend: ${preferred}`)
      return BACKEND_INFO[preferred]
    }
    console.warn(`[TF.js] Preferred backend '${preferred}' not available, falling back to auto-detect`)
  }

  // Auto-detect: try backends in priority order
  const backendPriority: BackendType[] = ['webgpu', 'webgl', 'cpu']

  for (const backend of backendPriority) {
    const success = await trySetBackend(backend)
    if (success) {
      console.log(`[TF.js] Initialized with backend: ${backend}`)
      return BACKEND_INFO[backend]
    }
  }

  // This should never happen as CPU is always available
  throw new Error('[TF.js] Failed to initialize any backend')
}

/**
 * Try to set a specific backend
 * @returns true if successful, false otherwise
 */
async function trySetBackend(backend: BackendType): Promise<boolean> {
  try {
    // Check if backend is registered
    const registeredBackends = tf.engine().registryFactory
    if (!registeredBackends[backend]) {
      return false
    }

    await tf.setBackend(backend)
    await tf.ready()
    
    // Verify the backend is actually set
    const currentBackend = tf.getBackend()
    return currentBackend === backend
  } catch (error) {
    console.warn(`[TF.js] Backend '${backend}' initialization failed:`, error)
    return false
  }
}

/**
 * Get information about the currently active backend
 */
export function getCurrentBackendInfo(): BackendInfo {
  const currentBackend = tf.getBackend() as BackendType
  return BACKEND_INFO[currentBackend] || BACKEND_INFO.cpu
}

/**
 * Check if a specific backend is available
 */
export async function isBackendAvailable(backend: BackendType): Promise<boolean> {
  try {
    const registeredBackends = tf.engine().registryFactory
    return !!registeredBackends[backend]
  } catch {
    return false
  }
}

/**
 * Get list of all available backends on this device
 */
export async function getAvailableBackends(): Promise<BackendType[]> {
  const available: BackendType[] = []
  const backends: BackendType[] = ['webgpu', 'webgl', 'cpu']

  for (const backend of backends) {
    if (await isBackendAvailable(backend)) {
      available.push(backend)
    }
  }

  return available
}

/**
 * Memory management utility - dispose tensors and free GPU memory
 */
export function cleanupTensors(): void {
  tf.disposeVariables()
}

/**
 * Get memory info for debugging
 */
export function getMemoryInfo(): { numTensors: number; numBytes: number } {
  const info = tf.memory()
  return {
    numTensors: info.numTensors,
    numBytes: info.numBytes,
  }
}


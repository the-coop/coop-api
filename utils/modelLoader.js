import { ModelPaths, getModelUrl } from '@game/shared'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelCache = new Map()

export class ServerModelLoader {
  constructor(isProduction = process.env.NODE_ENV === 'production') {
    this.isProduction = isProduction
  }

  async loadModel(modelPath) {
    // Check cache first
    if (modelCache.has(modelPath)) {
      return modelCache.get(modelPath)
    }

    const url = getModelUrl(modelPath, this.isProduction, false)
    
    try {
      let modelData
      
      if (this.isProduction) {
        // Fetch from remote server
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch model: ${response.statusText}`)
        }
        modelData = await response.arrayBuffer()
      } else {
        // In development, try to load from local file system first
        const localPath = path.join(__dirname, '../../client/public/models', modelPath)
        try {
          modelData = await fs.readFile(localPath)
        } catch (localError) {
          // Fallback to fetch from localhost
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`Failed to fetch model: ${response.statusText}`)
          }
          modelData = await response.arrayBuffer()
        }
      }
      
      // Cache the model data
      modelCache.set(modelPath, modelData)
      
      return modelData
    } catch (error) {
      console.error(`Failed to load model ${modelPath}:`, error)
      return null
    }
  }

  async preloadModels() {
    const modelPaths = Object.values(ModelPaths)
    const promises = modelPaths.map(path => this.loadModel(path))
    const results = await Promise.all(promises)
    
    const loaded = results.filter(r => r !== null).length
    console.log(`Preloaded ${loaded}/${modelPaths.length} models`)
    
    return loaded === modelPaths.length
  }

  // Get model metadata (size, bounding box, etc.)
  async getModelMetadata(modelPath) {
    // This would require parsing the GLB file
    // For now, return predefined metadata
    const metadata = {
      [ModelPaths.PLAYER]: {
        boundingBox: { x: 0.8, y: 1.8, z: 0.8 }
      },
      [ModelPaths.CAR]: {
        boundingBox: { x: 2, y: 1.5, z: 4 }
      },
      [ModelPaths.HELICOPTER]: {
        boundingBox: { x: 3, y: 3, z: 6 }
      },
      [ModelPaths.PLANE]: {
        boundingBox: { x: 8, y: 3, z: 5 }
      },
      [ModelPaths.GHOST_BOX]: {
        boundingBox: { x: 1, y: 1, z: 1 }
      },
      [ModelPaths.GHOST_SPHERE]: {
        boundingBox: { x: 1, y: 1, z: 1 }
      },
      [ModelPaths.GHOST_CYLINDER]: {
        boundingBox: { x: 1, y: 2, z: 1 }
      }
    }
    
    return metadata[modelPath] || null
  }
}

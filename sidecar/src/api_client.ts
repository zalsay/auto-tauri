// Node.js 18+ has native fetch, no import needed

/**
 * API Client for communicating with the Go backend server
 */

const DEFAULT_SERVER_URL = 'http://localhost:8080';

export interface MaterialCreateRequest {
    name: string;
    type: string;
    content: string;
    projectId?: string;
    imageUrls?: string;
}

export interface MaterialResponse {
    id: string;
    userId: string;
    projectId?: string;
    name: string;
    type: string;
    content: string;
    imageUrls?: string;
    createdAt: string;
    updatedAt: string;
}

export interface APIClientConfig {
    serverUrl?: string;
    authToken?: string;
}

function log(message: string) {
    console.error(JSON.stringify({ type: 'log', message, timestamp: new Date().toISOString() }));
}

/**
 * Creates a material in the material center via API
 * 
 * @param material - The material data to save
 * @param config - API client configuration including auth token
 * @returns The created material or null on failure
 */
export async function saveMaterial(
    material: MaterialCreateRequest,
    config: APIClientConfig
): Promise<MaterialResponse | null> {
    const serverUrl = config.serverUrl || DEFAULT_SERVER_URL;
    const url = `${serverUrl}/api/v1/materials`;

    log(`[APIClient] Saving material to ${url}: ${material.name}`);

    if (!config.authToken) {
        log(`[APIClient] Error: No auth token provided`);
        return null;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.authToken}`
            },
            body: JSON.stringify(material)
        });

        if (!response.ok) {
            const errorText = await response.text();
            log(`[APIClient] Failed to save material: ${response.status} - ${errorText}`);
            return null;
        }

        const savedMaterial = await response.json() as MaterialResponse;
        log(`[APIClient] Material saved successfully: ${savedMaterial.id}`);
        return savedMaterial;
    } catch (e: any) {
        log(`[APIClient] Error saving material: ${e.message}`);
        return null;
    }
}

/**
 * Saves AI workflow result to material center
 * 
 * @param workflowName - Name of the workflow
 * @param workflowContent - Generated workflow content/prompt
 * @param projectId - Optional project ID to associate
 * @param imageUrls - Optional image URLs (JSON array string)
 * @param config - API client configuration
 * @returns The created material or null
 */
export async function saveWorkflowAsMaterial(
    workflowName: string,
    workflowContent: string,
    projectId: string | undefined,
    imageUrls: string | undefined,
    config: APIClientConfig
): Promise<MaterialResponse | null> {
    const material: MaterialCreateRequest = {
        name: workflowName,
        type: 'workflow',
        content: workflowContent,
        projectId: projectId,
        imageUrls: imageUrls
    };

    return saveMaterial(material, config);
}

/**
 * Saves task execution result to material center
 * 
 * @param taskId - The task ID
 * @param output - The task output content
 * @param projectId - Optional project ID
 * @param name - Optional name (defaults to "Result: {taskId}")
 * @param imageUrls - Optional screenshot URLs
 * @param config - API client configuration
 * @returns The created material or null
 */
export async function saveTaskResultAsMaterial(
    taskId: string,
    output: string,
    projectId: string | undefined,
    name: string | undefined,
    imageUrls: string | undefined,
    config: APIClientConfig
): Promise<MaterialResponse | null> {
    const materialName = name || `Result: ${taskId} - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    const material: MaterialCreateRequest = {
        name: materialName,
        type: 'text',
        content: output,
        projectId: projectId,
        imageUrls: imageUrls
    };

    return saveMaterial(material, config);
}

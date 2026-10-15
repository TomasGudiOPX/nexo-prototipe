import { RagflowError, ragflow } from "./ragflow.server";

export async function validateRagflowConnection() {
  try {
    await ragflow("/api/v1/datasets?page=1&page_size=1");
    return { status: "success", message: "RAGFlow respondió correctamente." };
  } catch (error) {
    const status = error instanceof RagflowError ? error.status : 502;
    return {
      status: status === 502 || status === 503 ? "unavailable" : "failure",
      message: status === 401 || status === 403 ? "RAGFlow rechazó las credenciales configuradas." : status === 503 ? "La conexión RAGFlow no está configurada." : "No se pudo conectar con RAGFlow.",
    };
  }
}

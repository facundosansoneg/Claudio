"use server";

import { revalidatePath } from "next/cache";
import { createTask, updateTaskStatus, addTaskComment } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createTaskAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "task", "create");
  if (!allowed) throw new Error("No autorizado");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const taskType = String(formData.get("taskType") ?? "general");
  const priority = String(formData.get("priority") ?? "medium");
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;
  const propertyId = String(formData.get("propertyId") ?? "").trim() || null;

  await createTask(getDb(), {
    organizationId: context.organizationId,
    title,
    description,
    taskType,
    priority,
    dueDate,
    propertyId,
    createdBy: context.userId,
  });

  revalidatePath("/tasks");
}

export async function updateTaskStatusAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "task", "edit");
  if (!allowed) throw new Error("No autorizado");

  const taskId = String(formData.get("taskId") ?? "").trim();
  const newStatus = String(formData.get("newStatus") ?? "").trim();
  if (!taskId || !newStatus) throw new Error("Faltan campos obligatorios");

  await updateTaskStatus(getDb(), { organizationId: context.organizationId, taskId, newStatus, triggeredBy: context.userId });

  revalidatePath("/tasks");
}

export async function addTaskCommentAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "task", "comment");
  if (!allowed) throw new Error("No autorizado");

  const taskId = String(formData.get("taskId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId || !body) throw new Error("Faltan campos obligatorios");

  await addTaskComment(getDb(), { organizationId: context.organizationId, taskId, body, authorId: context.userId });

  revalidatePath("/tasks");
}

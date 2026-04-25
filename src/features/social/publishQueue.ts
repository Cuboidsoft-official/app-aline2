import { getReadableApiErrorMessage } from "../../api/networkErrors";

export type PublishQueueMode = "post" | "story" | "swipe";
export type PublishQueueStatus = "uploading" | "publishing" | "success" | "failed";

export type PublishQueueTask = {
  id: string;
  mode: PublishQueueMode;
  label: string;
  message: string;
  progress: number;
  status: PublishQueueStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type PublishQueueListener = (tasks: PublishQueueTask[]) => void;

type PublishTaskRunnerControls = {
  setProgress: (progress: number, message: string, status?: PublishQueueStatus) => void;
};

type StartPublishTaskInput = {
  mode: PublishQueueMode;
  label: string;
  run: (controls: PublishTaskRunnerControls) => Promise<void>;
};

let publishTasks: PublishQueueTask[] = [];
const listeners = new Set<PublishQueueListener>();

const emit = () => {
  const snapshot = [...publishTasks].sort((left, right) => right.createdAt - left.createdAt);
  listeners.forEach((listener) => {
    listener(snapshot);
  });
};

const clampProgress = (value: number) => Math.max(0, Math.min(1, Number(value) || 0));

const updateTask = (taskId: string, updater: (task: PublishQueueTask) => PublishQueueTask) => {
  publishTasks = publishTasks.map((task) => (task.id === taskId ? updater(task) : task));
  emit();
};

const removeTask = (taskId: string) => {
  publishTasks = publishTasks.filter((task) => task.id !== taskId);
  emit();
};

export const subscribePublishQueue = (listener: PublishQueueListener) => {
  listeners.add(listener);
  listener([...publishTasks].sort((left, right) => right.createdAt - left.createdAt));
  return () => {
    listeners.delete(listener);
  };
};

export const getPublishQueueSnapshot = () =>
  [...publishTasks].sort((left, right) => right.createdAt - left.createdAt);

export const dismissPublishQueueTask = (taskId: string) => {
  removeTask(taskId);
};

export const startPublishTask = ({ mode, label, run }: StartPublishTaskInput) => {
  const taskId = `publish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  publishTasks = [
    {
      id: taskId,
      mode,
      label,
      message: `Preparing ${label.toLowerCase()}...`,
      progress: 0.04,
      status: "uploading",
      createdAt: now,
      updatedAt: now,
    },
    ...publishTasks,
  ];
  emit();

  const setProgress = (progress: number, message: string, status: PublishQueueStatus = "uploading") => {
    updateTask(taskId, (task) => ({
      ...task,
      progress: clampProgress(progress),
      message,
      status,
      error: status === "failed" ? task.error : undefined,
      updatedAt: Date.now(),
    }));
  };

  void (async () => {
    try {
      await run({ setProgress });
      updateTask(taskId, (task) => ({
        ...task,
        progress: 1,
        status: "success",
        message: `${label} uploaded`,
        error: undefined,
        updatedAt: Date.now(),
      }));

      setTimeout(() => {
        removeTask(taskId);
      }, 3000);
    } catch (error: any) {
      const fallbackMessage = String(error?.message || `Failed to upload ${label.toLowerCase()}.`).trim();
      const message = getReadableApiErrorMessage(error, fallbackMessage);
      updateTask(taskId, (task) => ({
        ...task,
        status: "failed",
        error: message,
        message,
        updatedAt: Date.now(),
      }));
    }
  })();

  return taskId;
};

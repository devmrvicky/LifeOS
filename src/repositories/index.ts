export { TaskRepository, taskRepository } from './TaskRepository';
export { CaptureRepository, captureRepository } from './CaptureRepository';
export { ReminderRepository, reminderRepository } from './ReminderRepository';

import { taskRepository } from './TaskRepository';
import { captureRepository } from './CaptureRepository';
import { reminderRepository } from './ReminderRepository';

export async function clearAllData(): Promise<void> {
  await Promise.all([taskRepository.clear(), captureRepository.clear(), reminderRepository.clear()]);
}

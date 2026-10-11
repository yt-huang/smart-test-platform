import { executeAssignment } from './executor.js';
import { executeAndroidAssignment } from './appium.js';

export function executeTask(options) {
  if (options.target?.platform === 'android' && options.config.appiumUrl) return executeAndroidAssignment(options);
  return executeAssignment(options);
}

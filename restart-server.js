import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function restartServer() {
  try {
    console.log('Restarting server...');
    
    // Kill any existing node processes
    try {
      await execAsync('taskkill /F /IM node.exe');
      console.log('Stopped existing server processes');
    } catch (error) {
      // No process to kill, continue
    }
    
    // Start the server
    console.log('Starting server...');
    const { stdout, stderr } = await execAsync('npm run dev:server');
    
    console.log('Server started successfully');
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error('Error restarting server:', error);
  }
}

restartServer();
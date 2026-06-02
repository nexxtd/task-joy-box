import { db } from '../server/db';
import { projects, projectColumns, tasks, projectMembers } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function resetProjects() {
  try {
    console.log('Starting project reset...');
    
    // Get all project IDs
    const allProjects = await db.select({ id: projects.id }).from(projects);
    console.log(`Found ${allProjects.length} projects to reset`);
    
    // Reset each project: remove all columns and tasks associated with projects
    for (const project of allProjects) {
      console.log(`Resetting project ${project.id}...`);
      
      // Delete all project columns
      await db.delete(projectColumns).where(eq(projectColumns.projectId, project.id));
      
      // Delete all tasks associated with this project
      await db.delete(tasks).where(eq(tasks.projectId, project.id));
      
      console.log(`Project ${project.id} reset complete`);
    }
    
    console.log('All projects have been reset successfully!');
    console.log('Each project now has no columns or tasks.');
    
  } catch (error) {
    console.error('Error during project reset:', error);
  }
}

// Run the reset function
resetProjects();
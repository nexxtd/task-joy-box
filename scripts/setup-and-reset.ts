import { db } from '../server/db';
import { projects, projectColumns, tasks, projectMembers } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function setupAndReset() {
  try {
    console.log('Running database migrations...');
    
    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log('Database migrations completed.');
    
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
    
    console.log('Setup and reset completed successfully!');
    console.log('All projects have been reset with no columns or tasks.');
    
  } catch (error) {
    console.error('Error during setup and reset:', error);
  }
}

// Run the setup and reset function
setupAndReset();
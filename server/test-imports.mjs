import 'dotenv/config';
import express from 'express';

async function testImports() {
    const modules = [
        './auth',
        './ai',
        './calendar',
        './payment',
        './collaboration',
        './organizations',
        './workspace',
        './goals',
        './notes',
        './settings',
        './attachments',
        './admin'
    ];

    for (const mod of modules) {
        try {
            console.log(`Testing import of ./routes/${mod}...`);
            await import(`./routes/${mod}.ts`);
            console.log(`SUCCESS: ./routes/${mod}`);
        } catch (err) {
            console.error(`FAILED: ./routes/${mod}`);
            console.error(err);
            // Don't exit, keep testing others
        }
    }
}

testImports();

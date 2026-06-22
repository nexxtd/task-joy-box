declare module 'connect-pg-simple' {
    import { Store } from 'express-session';
    import { Pool } from 'pg';

    interface PostgreSqlStoreOptions {
        pool?: Pool;
        pgPromise?: any;
        conString?: string;
        tableName?: string;
        schemaName?: string;
        ttl?: number;
        createTableIfMissing?: boolean;
        disableTouch?: boolean;
    }

    function connectPgSimple(session: any): {
        new (options?: PostgreSqlStoreOptions): Store;
    };

    export = connectPgSimple;
}

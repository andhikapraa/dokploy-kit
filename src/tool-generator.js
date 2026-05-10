/**
 * Generates MCP tool registrations from the parsed Dokploy OpenAPI spec.
 * Groups endpoints by tag into domain tools with action routing.
 */

const { z } = require('zod');

/**
 * Flatten nested anyOf/oneOf to remove redundant null wrapping.
 * e.g., anyOf: [anyOf: [type:object, type:null], type:null] -> [type:object, type:null]
 */
function flattenAnyOf(variants) {
  const result = [];
  for (const v of variants) {
    if ((v.anyOf || v.oneOf) && !v.type && !v.properties && !v.enum) {
      result.push(...flattenAnyOf(v.anyOf || v.oneOf));
    } else {
      result.push(v);
    }
  }
  // Deduplicate null entries
  const hasNull = result.some(v => v.type === 'null');
  const nonNull = result.filter(v => v.type !== 'null');
  if (hasNull) nonNull.push({ type: 'null' });
  return nonNull;
}

/**
 * Convert an OpenAPI schema property to a Zod schema.
 * Handles nested anyOf, propertyNames, nullable patterns safely.
 */
function openApiToZod(prop, required = false, depth = 0) {
  // Safety: avoid infinite recursion on deeply nested schemas
  if (depth > 5) return applyModifiers(z.any(), prop, required);

  let schema;

  try {
    if (prop.anyOf || prop.oneOf) {
      const variants = flattenAnyOf(prop.anyOf || prop.oneOf);
      const nonNull = variants.filter(v => v.type !== 'null');
      const isNullable = variants.some(v => v.type === 'null');

      if (nonNull.length === 0) {
        schema = z.any();
      } else if (nonNull.length === 1) {
        schema = openApiToZod(nonNull[0], true, depth + 1);
        if (isNullable) schema = schema.nullable();
      } else {
        // Multiple non-null types — use z.any() for safety
        schema = z.any();
        if (isNullable) schema = schema.nullable();
      }
    } else if (prop.enum) {
      if (prop.enum.length === 1) {
        schema = z.literal(prop.enum[0]);
      } else {
        schema = z.enum(prop.enum);
      }
    } else {
      switch (prop.type) {
        case 'string':
          schema = z.string();
          if (prop.minLength) schema = schema.min(prop.minLength);
          break;
        case 'number':
        case 'integer':
          schema = z.number();
          if (prop.minimum !== undefined) schema = schema.min(prop.minimum);
          if (prop.maximum !== undefined) schema = schema.max(prop.maximum);
          break;
        case 'boolean':
          schema = z.boolean();
          break;
        case 'array':
          if (prop.items) {
            schema = z.array(openApiToZod(prop.items, true, depth + 1));
          } else {
            schema = z.array(z.any());
          }
          break;
        case 'object':
          if (prop.properties) {
            const shape = {};
            for (const [k, v] of Object.entries(prop.properties)) {
              const isReq = (prop.required || []).includes(k);
              shape[k] = openApiToZod(v, isReq, depth + 1);
            }
            schema = z.object(shape);
          } else if (prop.additionalProperties) {
            // Record type: { [key: string]: valueType }
            const valSchema = typeof prop.additionalProperties === 'object'
              ? openApiToZod(prop.additionalProperties, true, depth + 1)
              : z.any();
            schema = z.record(z.string(), valSchema);
          } else {
            // Generic object (may have propertyNames but no properties)
            schema = z.record(z.string(), z.any());
          }
          break;
        default:
          schema = z.any();
      }
    }
  } catch (e) {
    // Fallback for any schema that can't be converted
    schema = z.any();
  }

  return applyModifiers(schema, prop, required);
}

function applyModifiers(schema, prop, required) {
  if (prop.nullable && !schema._def?.typeName?.includes('Nullable')) {
    try { schema = schema.nullable(); } catch { /* already nullable */ }
  }

  if (!required) {
    schema = schema.optional();
  }

  if (prop.description) {
    schema = schema.describe(prop.description);
  }

  return schema;
}

/**
 * Build a Zod input schema for a domain tool.
 * Each tool gets an 'action' enum plus the union of all possible parameters.
 */
function buildToolSchema(tag, endpoints, options = {}) {
  const { instanceNames = [], defaultInstance = null } = options;

  const actionNames = endpoints.map(ep => {
    const opId = ep.operationId;
    // Extract action from operationId like "project-create" -> "create"
    const parts = opId.split('-');
    return parts.slice(1).join('-') || parts[0];
  });

  const shape = {
    action: z.enum(actionNames).describe(`Action to perform on ${tag}`),
  };

  // Reserve 'action' for routing; reserve 'instance' when multi-instance.
  const paramsSeen = new Set(['action']);
  if (instanceNames.length > 1) {
    shape.instance = z.enum(instanceNames)
      .optional()
      .describe(`Dokploy instance to target. Default: ${defaultInstance}. Available: ${instanceNames.join(', ')}`);
    paramsSeen.add('instance');
  }
  // Collect all unique parameters across all endpoints
  // Rename collisions with reserved keys to 'param_<key>'
  const reserved = new Set(['action', 'instance']);
  const renameIfReserved = (k) => (reserved.has(k) ? `param_${k}` : k);

  for (const ep of endpoints) {
    // Query/path params
    for (const param of ep.params) {
      const key = renameIfReserved(param.name);
      if (!paramsSeen.has(key)) {
        paramsSeen.add(key);
        shape[key] = openApiToZod(param.schema, false)
          .describe(`${param.in} param: ${param.name}`);
      }
    }

    // Body properties
    for (const [propName, propSchema] of Object.entries(ep.bodyProps)) {
      const key = renameIfReserved(propName);
      if (!paramsSeen.has(key)) {
        paramsSeen.add(key);
        shape[key] = openApiToZod(propSchema, false);
      }
    }
  }

  return { shape, actionNames };
}

/**
 * Create the action-to-endpoint mapping for runtime routing
 */
function buildActionMap(tag, endpoints) {
  const actionMap = {};
  for (const ep of endpoints) {
    const parts = ep.operationId.split('-');
    const action = parts.slice(1).join('-') || parts[0];
    const queryParamsSpec = ep.params.filter(p => p.in === 'query');
    actionMap[action] = {
      path: `/${ep.operationId.replace(/-/g, '.')}`,
      method: ep.method,
      queryParams: queryParamsSpec.map(p => p.name),
      queryRequired: queryParamsSpec.filter(p => p.required).map(p => p.name),
      pathParams: ep.params
        .filter(p => p.in === 'path')
        .map(p => p.name),
      bodyProps: Object.keys(ep.bodyProps),
      bodyRequired: ep.bodyRequired || [],
      hasBody: ep.hasBody,
    };
  }
  return actionMap;
}

/**
 * Generate descriptions for each domain tool
 */
function generateDescription(tag, endpoints) {
  const actionNames = endpoints.map(ep => {
    const parts = ep.operationId.split('-');
    return parts.slice(1).join('-') || parts[0];
  });

  const actionList = actionNames.join(', ');
  const descriptions = {
    admin: 'Dokploy admin operations (setup monitoring)',
    docker: 'Docker container management (list, inspect, restart containers)',
    compose: 'Docker Compose service management (create, deploy, start, stop, templates)',
    registry: 'Container registry management (create, test, update registries)',
    cluster: 'Cluster management (add/remove nodes, list nodes)',
    user: 'User management (list, create, update, permissions, API keys)',
    domain: 'Domain management (create, update, delete, validate domains)',
    destination: 'Destination/server management (create, test, update connections)',
    backup: 'Backup management (create, list, manual backups for all DB types)',
    deployment: 'Deployment management (list, kill, remove deployments)',
    mounts: 'Volume mount management (create, list, update mounts)',
    certificates: 'SSL certificate management (create, list, remove certificates)',
    settings: 'System settings (Traefik config, cleanup, GPU, monitoring)',
    security: 'Security rules management (create, update, delete rules)',
    redirects: 'URL redirect management (create, update, delete redirects)',
    port: 'Port mapping management (create, update, delete port mappings)',
    project: 'Project management (create, list, update, delete, search projects)',
    application: 'Application lifecycle (create, deploy, start, stop, configure)',
    mysql: 'MySQL database management (create, deploy, start, stop, configure)',
    postgres: 'PostgreSQL database management (create, deploy, start, stop, configure)',
    redis: 'Redis database management (create, deploy, start, stop, configure)',
    mongo: 'MongoDB database management (create, deploy, start, stop, configure)',
    mariadb: 'MariaDB database management (create, deploy, start, stop, configure)',
    sshKey: 'SSH key management (create, generate, list, update, remove)',
    gitProvider: 'Git provider management (list all, remove providers)',
    bitbucket: 'Bitbucket integration (providers, repos, branches, test connection)',
    github: 'GitHub integration (providers, repos, branches, test connection)',
    gitlab: 'GitLab integration (providers, repos, branches, test connection)',
    gitea: 'Gitea integration (providers, repos, branches, test connection)',
    ai: 'AI service management (create, deploy, suggest, manage models)',
    notification: 'Notification channel management (Discord, Slack, Telegram, Email, etc.)',
    organization: 'Organization management (create, invite, roles, settings)',
    patch: 'Patch management (create, apply, manage file patches)',
    customRole: 'Custom role management (create, update, assign roles)',
    sso: 'SSO provider management (register, update, trusted origins)',
    stripe: 'Stripe billing management (plans, invoices, subscriptions)',
    licenseKey: 'License key management (activate, validate, enterprise settings)',
    whitelabeling: 'White-labeling customization (get, update, reset branding)',
    auditLog: 'Audit log viewing (list all audit log entries)',
    environment: 'Environment management (create, update, duplicate environments)',
    server: 'Server management (create, setup, monitor, validate servers)',
    swarm: 'Docker Swarm management (nodes, node info, node apps)',
    previewDeployment: 'Preview deployment management (list, delete, redeploy)',
    rollback: 'Deployment rollback (rollback, delete rollback entries)',
    schedule: 'Scheduled task management (create, update, delete, run schedules)',
    volumeBackups: 'Volume backup management (create, list, run, delete)',
  };

  return `${descriptions[tag] || `Dokploy ${tag} operations`}. Actions: ${actionList}`;
}

/**
 * Register all tools from the parsed endpoints
 */
function generateTools(parsedEndpoints, options = {}) {
  // Group by tag
  const byTag = {};
  for (const ep of parsedEndpoints) {
    for (const tag of ep.tags) {
      if (!byTag[tag]) byTag[tag] = [];
      byTag[tag].push(ep);
    }
  }

  const tools = [];
  for (const [tag, endpoints] of Object.entries(byTag)) {
    const { shape, actionNames } = buildToolSchema(tag, endpoints, options);
    const actionMap = buildActionMap(tag, endpoints);
    const description = generateDescription(tag, endpoints);

    tools.push({
      name: `dokploy_${tag}`,
      description,
      shape,
      actionMap,
      actionNames,
    });
  }

  return tools;
}

module.exports = { generateTools, buildActionMap };

// V1 API Handler
// All v1-specific types, helpers, and endpoint logic

// Request body types for v1 API
interface CreateChooserRequest {
  template_slug: string;
  title: string;
  description?: string;
  selection_labels?: string[];
}

interface UpdateOptionsRequest {
  admin_id: string;
  options: {
    value: string;
    order: number;
    metadata?: Record<string, any>;
  }[];
}

interface PublishChooserRequest {
  admin_id: string;
}

interface SubmitSelectionsRequest {
  participant_name: string;
  selections: {
    option_id: number;
    selection_value: string;
  }[];
}

// Helper: Generate cryptographically random ID
function generateId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes)
    .map(byte => chars[byte % chars.length])
    .join('');
}

// Helper: JSON response
function jsonResponse(data: any, status: number = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export async function handleV1(
  request: Request,
  db: D1Database,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/v1', '');
  const method = request.method;

  // Health check
  if (path === '/health') {
    return jsonResponse({ status: 'ok', version: 'v1' }, 200, corsHeaders);
  }

  // GET /templates - List available templates
  if (path === '/templates' && method === 'GET') {
    try {
      const { results: templates } = await db
        .prepare('SELECT slug, name, description, template_data FROM chooser_templates ORDER BY name ASC')
        .all();

      return jsonResponse({
        templates: templates.map((t: any) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          template_data: JSON.parse(t.template_data as string)
        }))
      }, 200, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to fetch templates: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  // POST /choosers - Create new chooser
  if (path === '/choosers' && method === 'POST') {
    try {
      const body = await request.json() as CreateChooserRequest;
      const { template_slug, title, description, selection_labels } = body;

      // Validate required fields
      if (!template_slug || !title) {
        return jsonResponse(
          { error: 'Missing required fields: template_slug, title' },
          400,
          corsHeaders
        );
      }

      // Fetch template data
      const template = await db
        .prepare('SELECT template_data FROM chooser_templates WHERE slug = ?')
        .bind(template_slug)
        .first();

      if (!template) {
        return jsonResponse(
          { error: `Template not found: ${template_slug}` },
          404,
          corsHeaders
        );
      }

      // Generate IDs
      const instanceId = generateId(8);
      const adminId = generateId(16); // Longer for security

      // Default selection labels
      const labels = selection_labels || ['no', 'ok', 'ideal'];

      // Insert chooser instance
      await db
        .prepare(`
          INSERT INTO chooser_instances
          (id, admin_id, title, description, template_data, selection_labels, published)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `)
        .bind(
          instanceId,
          adminId,
          title,
          description || null,
          template.template_data,
          JSON.stringify(labels)
        )
        .run();

      // Return success with URLs
      return jsonResponse({
        success: true,
        instance_id: instanceId,
        admin_id: adminId,
        participant_url: `/a/v1/${instanceId}`,
        admin_url: `/a/v1/admin/${instanceId}/${adminId}`,
        published: false
      }, 201, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to create chooser: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  // PUT /choosers/:id/options - Add/update options (requires admin_id)
  const optionsMatch = path.match(/^\/choosers\/([a-z0-9]+)\/options$/);
  if (optionsMatch && method === 'PUT') {
    try {
      const instanceId = optionsMatch[1];
      const body = await request.json() as UpdateOptionsRequest;
      const { admin_id, options } = body;

      // Validate required fields
      if (!admin_id || !options || !Array.isArray(options)) {
        return jsonResponse(
          { error: 'Missing required fields: admin_id, options (array)' },
          400,
          corsHeaders
        );
      }

      // Verify admin_id matches
      const chooser = await db
        .prepare('SELECT admin_id FROM chooser_instances WHERE id = ?')
        .bind(instanceId)
        .first();

      if (!chooser) {
        return jsonResponse(
          { error: 'Chooser not found' },
          404,
          corsHeaders
        );
      }

      if (chooser.admin_id !== admin_id) {
        return jsonResponse(
          { error: 'Invalid admin_id' },
          403,
          corsHeaders
        );
      }

      // Delete existing options
      await db
        .prepare('DELETE FROM chooser_options WHERE chooser_id = ?')
        .bind(instanceId)
        .run();

      // Insert new options
      for (const option of options) {
        const { value, order, metadata } = option;

        if (!value || order === undefined) {
          return jsonResponse(
            { error: 'Each option must have "value" and "order" fields' },
            400,
            corsHeaders
          );
        }

        await db
          .prepare(`
            INSERT INTO chooser_options (chooser_id, option_value, option_order, metadata)
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            instanceId,
            value,
            order,
            metadata ? JSON.stringify(metadata) : null
          )
          .run();
      }

      // Update the chooser's updated_at timestamp
      await db
        .prepare('UPDATE chooser_instances SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(instanceId)
        .run();

      return jsonResponse({
        success: true,
        options_count: options.length
      }, 200, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to update options: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  // PUT /choosers/:id/publish - Publish chooser (requires admin_id)
  const publishMatch = path.match(/^\/choosers\/([a-z0-9]+)\/publish$/);
  if (publishMatch && method === 'PUT') {
    try {
      const instanceId = publishMatch[1];
      const body = await request.json() as PublishChooserRequest;
      const { admin_id } = body;

      // Validate required fields
      if (!admin_id) {
        return jsonResponse(
          { error: 'Missing required field: admin_id' },
          400,
          corsHeaders
        );
      }

      // Verify admin_id matches
      const chooser = await db
        .prepare('SELECT admin_id, published FROM chooser_instances WHERE id = ?')
        .bind(instanceId)
        .first();

      if (!chooser) {
        return jsonResponse(
          { error: 'Chooser not found' },
          404,
          corsHeaders
        );
      }

      if (chooser.admin_id !== admin_id) {
        return jsonResponse(
          { error: 'Invalid admin_id' },
          403,
          corsHeaders
        );
      }

      // Check if already published
      if (chooser.published === 1) {
        return jsonResponse({
          success: true,
          message: 'Chooser is already published',
          published: true
        }, 200, corsHeaders);
      }

      // Publish the chooser
      await db
        .prepare('UPDATE chooser_instances SET published = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(instanceId)
        .run();

      return jsonResponse({
        success: true,
        message: 'Chooser published successfully',
        published: true
      }, 200, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to publish chooser: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  // POST /choosers/:id/selections - Submit participant selections
  const selectionsMatch = path.match(/^\/choosers\/([a-z0-9]+)\/selections$/);
  if (selectionsMatch && method === 'POST') {
    try {
      const instanceId = selectionsMatch[1];
      const body = await request.json() as SubmitSelectionsRequest;
      const { participant_name, selections } = body;

      // Validate required fields
      if (!participant_name || !selections || !Array.isArray(selections)) {
        return jsonResponse(
          { error: 'Missing required fields: participant_name, selections (array)' },
          400,
          corsHeaders
        );
      }

      // Fetch chooser and validate it's published
      const chooser = await db
        .prepare('SELECT published, selection_labels FROM chooser_instances WHERE id = ?')
        .bind(instanceId)
        .first();

      if (!chooser) {
        return jsonResponse(
          { error: 'Chooser not found' },
          404,
          corsHeaders
        );
      }

      if (chooser.published !== 1) {
        return jsonResponse(
          { error: 'Chooser is not published yet' },
          403,
          corsHeaders
        );
      }

      // Parse allowed selection labels
      const allowedLabels = JSON.parse(chooser.selection_labels as string);

      // Validate and insert/update selections
      for (const selection of selections) {
        const { option_id, selection_value } = selection;

        if (!option_id || !selection_value) {
          return jsonResponse(
            { error: 'Each selection must have "option_id" and "selection_value" fields' },
            400,
            corsHeaders
          );
        }

        // Validate selection_value is allowed
        if (!allowedLabels.includes(selection_value)) {
          return jsonResponse(
            { error: `Invalid selection_value: "${selection_value}". Allowed values: ${allowedLabels.join(', ')}` },
            400,
            corsHeaders
          );
        }

        // Verify option belongs to this chooser
        const option = await db
          .prepare('SELECT id FROM chooser_options WHERE id = ? AND chooser_id = ?')
          .bind(option_id, instanceId)
          .first();

        if (!option) {
          return jsonResponse(
            { error: `Invalid option_id: ${option_id} does not belong to this chooser` },
            400,
            corsHeaders
          );
        }

        // Check if selection already exists
        const existing = await db
          .prepare(`
            SELECT id FROM participant_selections
            WHERE chooser_id = ? AND option_id = ? AND participant_name = ?
          `)
          .bind(instanceId, option_id, participant_name)
          .first();

        if (existing) {
          // Update existing selection
          await db
            .prepare(`
              UPDATE participant_selections
              SET selection_value = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(selection_value, existing.id)
            .run();
        } else {
          // Insert new selection
          await db
            .prepare(`
              INSERT INTO participant_selections
              (chooser_id, option_id, participant_name, selection_value)
              VALUES (?, ?, ?, ?)
            `)
            .bind(instanceId, option_id, participant_name, selection_value)
            .run();
        }
      }

      // Update viewed_at timestamp
      await db
        .prepare('UPDATE chooser_instances SET viewed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(instanceId)
        .run();

      return jsonResponse({
        success: true,
        participant_name,
        selections_count: selections.length
      }, 200, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to submit selections: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  // GET /choosers/:id/results - View aggregated results
  const resultsMatch = path.match(/^\/choosers\/([a-z0-9]+)\/results$/);
  if (resultsMatch && method === 'GET') {
    try {
      const instanceId = resultsMatch[1];

      // Fetch chooser instance
      const chooser = await db
        .prepare('SELECT id, title, published, selection_labels FROM chooser_instances WHERE id = ?')
        .bind(instanceId)
        .first();

      if (!chooser) {
        return jsonResponse(
          { error: 'Chooser not found' },
          404,
          corsHeaders
        );
      }

      // Parse selection labels
      const selectionLabels = JSON.parse(chooser.selection_labels as string);

      // Fetch all options for this chooser
      const { results: options } = await db
        .prepare(`
          SELECT id, option_value, option_order, metadata
          FROM chooser_options
          WHERE chooser_id = ?
          ORDER BY option_order ASC
        `)
        .bind(instanceId)
        .all();

      // Fetch all selections for this chooser
      const { results: selections } = await db
        .prepare(`
          SELECT option_id, participant_name, selection_value
          FROM participant_selections
          WHERE chooser_id = ?
          ORDER BY participant_name ASC
        `)
        .bind(instanceId)
        .all();

      // Build results structure
      const optionsWithResults = options.map((option: any) => {
        // Filter selections for this option
        const optionSelections = selections.filter((s: any) => s.option_id === option.id);

        // Count selections by value
        const summary: Record<string, number> = {};
        selectionLabels.forEach((label: string) => {
          summary[label] = 0;
        });
        optionSelections.forEach((s: any) => {
          summary[s.selection_value] = (summary[s.selection_value] || 0) + 1;
        });

        return {
          id: option.id,
          value: option.option_value,
          order: option.option_order,
          metadata: option.metadata ? JSON.parse(option.metadata) : null,
          summary,
          selections: optionSelections.map((s: any) => ({
            participant_name: s.participant_name,
            selection_value: s.selection_value
          }))
        };
      });

      // Get unique participant names
      const participants = [...new Set(selections.map((s: any) => s.participant_name))];

      // Update viewed_at timestamp
      await db
        .prepare('UPDATE chooser_instances SET viewed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(instanceId)
        .run();

      return jsonResponse({
        chooser: {
          id: chooser.id,
          title: chooser.title,
          published: chooser.published === 1,
          selection_labels: selectionLabels
        },
        options: optionsWithResults,
        participants: participants.sort()
      }, 200, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to fetch results: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  // GET /choosers/:id - Get chooser details
  const chooserMatch = path.match(/^\/choosers\/([a-z0-9]+)$/);
  if (chooserMatch && method === 'GET') {
    try {
      const instanceId = chooserMatch[1];

      // Fetch chooser instance
      const chooser = await db
        .prepare(`
          SELECT id, title, description, template_data, selection_labels, published, created_at
          FROM chooser_instances
          WHERE id = ?
        `)
        .bind(instanceId)
        .first();

      if (!chooser) {
        return jsonResponse(
          { error: 'Chooser not found' },
          404,
          corsHeaders
        );
      }

      // Update viewed_at timestamp (for cleanup tracking)
      await db
        .prepare('UPDATE chooser_instances SET viewed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(instanceId)
        .run();

      // Fetch options
      const { results: options } = await db
        .prepare(`
          SELECT id, option_value, option_order, metadata
          FROM chooser_options
          WHERE chooser_id = ?
          ORDER BY option_order ASC
        `)
        .bind(instanceId)
        .all();

      // Return chooser with options
      return jsonResponse({
        id: chooser.id,
        title: chooser.title,
        description: chooser.description,
        template_data: JSON.parse(chooser.template_data as string),
        selection_labels: JSON.parse(chooser.selection_labels as string),
        published: chooser.published === 1,
        created_at: chooser.created_at,
        options: options.map((opt: any) => ({
          id: opt.id,
          value: opt.option_value,
          order: opt.option_order,
          metadata: opt.metadata ? JSON.parse(opt.metadata) : null
        }))
      }, 200, corsHeaders);

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: `Failed to fetch chooser: ${error_message}` },
        500,
        corsHeaders
      );
    }
  }

  return jsonResponse({ error: 'Endpoint not implemented' }, 404, corsHeaders);
}

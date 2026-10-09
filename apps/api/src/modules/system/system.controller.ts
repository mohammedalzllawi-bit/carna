import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller({ version: VERSION_NEUTRAL })
export class SystemController {
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Identify the API service, not the web or admin application' })
  index() {
    return {
      service: 'Carna API',
      type: 'backend',
      message: 'This is the API service. The web and admin applications use separate URLs.',
      documentation: '/api/docs',
      health: '/health',
    };
  }

  @Get('health')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Process liveness only; does not check MongoDB, Redis or payment providers' })
  health() {
    return { service: 'Carna API', status: 'ok', check: 'liveness' };
  }
}

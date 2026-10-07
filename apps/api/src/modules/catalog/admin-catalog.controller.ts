import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminKeyGuard } from './admin-key.guard';
import { CatalogService } from './catalog.service';
import {
  AdminVehicleQueryDto,
  CreateCityDto,
  CreateVehicleDto,
  UpdateCityDto,
  UpdateVehicleDto,
} from './dto/catalog.dto';

@ApiTags('Admin Catalog')
@ApiHeader({ name: 'x-admin-key', required: true })
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get real dashboard metrics' })
  overview() {
    return this.catalog.getAdminOverview();
  }

  @Get('vehicles')
  vehicles(@Query() query: AdminVehicleQueryDto) {
    return this.catalog.listAdminVehicles(query);
  }

  @Post('vehicles')
  createVehicle(@Body() input: CreateVehicleDto) {
    return this.catalog.createVehicle(input);
  }

  @Patch('vehicles/:id')
  updateVehicle(@Param('id') id: string, @Body() input: UpdateVehicleDto) {
    return this.catalog.updateVehicle(id, input);
  }

  @Post('vehicles/:id/publish')
  publishVehicle(@Param('id') id: string) {
    return this.catalog.publishVehicle(id);
  }

  @Delete('vehicles/:id')
  archiveVehicle(@Param('id') id: string) {
    return this.catalog.archiveVehicle(id);
  }

  @Get('cities')
  cities() {
    return this.catalog.getCities(true);
  }

  @Post('cities')
  createCity(@Body() input: CreateCityDto) {
    return this.catalog.createCity(input);
  }

  @Patch('cities/:id')
  updateCity(@Param('id') id: string, @Body() input: UpdateCityDto) {
    return this.catalog.updateCity(id, input);
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { VehicleQueryDto } from './dto/catalog.dto';

@ApiTags('Catalog')
@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('home')
  @ApiOperation({ summary: 'Public home data sourced from MongoDB' })
  home() {
    return this.catalog.getPublicHome();
  }

  @Get('cities')
  @ApiOperation({ summary: 'List active cities and regions' })
  cities() {
    return this.catalog.getCities();
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Search published vehicles' })
  vehicles(@Query() query: VehicleQueryDto) {
    return this.catalog.listPublicVehicles(query);
  }

  @Get('vehicles/:id')
  vehicle(@Param('id') id: string) {
    return this.catalog.getPublicVehicle(id);
  }
}

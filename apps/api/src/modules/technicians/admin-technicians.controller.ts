import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { CreateTechnicianDto, ModerateTechnicianReviewDto, UpdateTechnicianDto } from './dto/technician.dto';
import { TechniciansService } from './technicians.service';
import { AuthenticatedRequest } from '../auth/auth.types';

@ApiTags('Admin Technicians')
@ApiHeader({ name: 'x-admin-key', required: true })
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin/technicians', version: '1' })
export class AdminTechniciansController {
  constructor(private readonly technicians: TechniciansService) {}

  @Get()
  list() {
    return this.technicians.listAdmin();
  }

  @Post()
  create(@Body() input: CreateTechnicianDto) {
    return this.technicians.create(input);
  }

  @Get(':id')
  detail(@Param('id') id: string) { return this.technicians.adminDetail(id); }

  @Patch('reviews/:id')
  review(@Param('id') id: string, @Body() input: ModerateTechnicianReviewDto, @Req() request: AuthenticatedRequest) {
    return this.technicians.moderateReview(id, input, request.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdateTechnicianDto) {
    return this.technicians.update(id, input);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.technicians.publish(id);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.technicians.archive(id);
  }
}

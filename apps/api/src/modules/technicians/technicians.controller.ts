import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTechnicianReviewDto, TechnicianQueryDto } from './dto/technician.dto';
import { TechniciansService } from './technicians.service';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

@ApiTags('Technicians')
@Controller({ path: 'technicians', version: '1' })
export class TechniciansController {
  constructor(private readonly technicians: TechniciansService) {}

  @Get()
  @ApiOperation({ summary: 'List approved technicians without private contact data' })
  list(@Query() query: TechnicianQueryDto) {
    return this.technicians.listPublic(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) { return this.technicians.publicDetail(id); }

  @Post(':id/reviews')
  @UseGuards(AccessTokenGuard)
  review(@Param('id') id: string, @Body() input: CreateTechnicianReviewDto, @Req() request: AuthenticatedRequest) {
    return this.technicians.review(id, request.user.id, input);
  }
}

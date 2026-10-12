import { Controller, Get, Patch, Delete, Param, Body, Request } from '@nestjs/common';
import { RolesService } from './roles.service';

import { MienQuyen, Quyen } from '../auth/quyen/quyen.decorator';
@Controller('roles')
@MienQuyen('taiKhoan')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** GET /roles - List all roles */
  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  /** PATCH /roles/:id - Rename a role */
  @Quyen('quanLyRole')
  @Patch(':id')
  async update(@Param('id') id: string, @Body('name') name: string, @Request() req: any) {
    await this.rolesService.update(id, name, req.user?.username || 'system');
    return { success: true };
  }

  /** DELETE /roles/:id - Delete a role */
  @Quyen('quanLyRole')
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.rolesService.remove(id, req.user?.username || 'system');
    return { success: true };
  }
}

import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { CatalogService } from "./catalog.service";
import {
  CreateLocationDto,
  UpdateCategoryDto,
  UpdateLocationDto,
  UpdateSkillDto,
} from "./dto/catalog-admin.dto";

@ApiTags("admin-catalog")
@Controller("admin")
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogService) {}

  @Patch("categories/:id")
  @Policy(Policies.admin())
  updateCategory(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(id, body);
  }

  @Patch("skills/:id")
  @Policy(Policies.admin())
  updateSkill(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateSkillDto,
  ) {
    return this.catalog.updateSkill(id, body);
  }

  @Post("locations")
  @Policy(Policies.admin())
  createLocation(@Body() body: CreateLocationDto) {
    return this.catalog.createLocation(body);
  }

  @Patch("locations/:id")
  @Policy(Policies.admin())
  updateLocation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateLocationDto,
  ) {
    return this.catalog.updateLocation(id, body);
  }
}

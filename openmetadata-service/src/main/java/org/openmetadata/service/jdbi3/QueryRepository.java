package org.openmetadata.service.jdbi3;

import static org.openmetadata.service.Entity.FIELD_FOLLOWERS;
import static org.openmetadata.service.Entity.FIELD_OWNER;
import static org.openmetadata.service.Entity.FIELD_TAGS;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.apache.commons.codec.binary.Hex;
import org.openmetadata.common.utils.CommonUtil;
import org.openmetadata.schema.entity.data.Query;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.service.Entity;
import org.openmetadata.service.resources.query.QueryResource;
import org.openmetadata.service.util.EntityUtil;
import org.openmetadata.service.util.RestUtil;
import org.openmetadata.service.util.ResultList;

public class QueryRepository extends EntityRepository<Query> {

  private static final String QUERY_PATCH_FIELDS = "owner,tags,users,vote,queryUsedIn,followers";
  private static final String QUERY_UPDATE_FIELDS = "owner,tags,users,queryUsedIn,followers";

  public QueryRepository(CollectionDAO dao) {
    super(
        QueryResource.COLLECTION_PATH,
        Entity.QUERY,
        Query.class,
        dao.queryDAO(),
        dao,
        QUERY_PATCH_FIELDS,
        QUERY_UPDATE_FIELDS);
  }

  @Override
  public Query setFields(Query entity, EntityUtil.Fields fields) throws IOException {
    entity.setOwner(fields.contains(FIELD_OWNER) ? getOwner(entity) : null);
    entity.setTags(fields.contains(FIELD_TAGS) ? getTags(entity.getFullyQualifiedName()) : null);
    entity.setFollowers(fields.contains(FIELD_FOLLOWERS) ? getFollowers(entity) : null);
    entity.setQueryUsedIn(fields.contains("queryUsedIn") ? this.getQueryUsage(entity) : null);
    entity.setUsers(fields.contains("users") ? this.getQueryUsers(entity) : null);
    return entity;
  }

  public List<EntityReference> getQueryUsage(Query queryEntity) {
    if (queryEntity == null) {
      return Collections.emptyList();
    }
    List<EntityReference> queryUsage = new ArrayList<>();
    // null means it will find all the relationships to Query from any entity type
    List<CollectionDAO.EntityRelationshipRecord> records =
        findFrom(queryEntity.getId(), Entity.QUERY, Relationship.MENTIONED_IN, null);
    for (CollectionDAO.EntityRelationshipRecord record : records) {
      queryUsage.add(new EntityReference().withId(record.getId()).withType(record.getType()));
    }
    return queryUsage;
  }

  public List<EntityReference> getQueryUsers(Query queryEntity) {
    if (queryEntity == null) {
      return Collections.emptyList();
    }
    List<EntityReference> queryUsers = new ArrayList<>();
    List<CollectionDAO.EntityRelationshipRecord> records =
        findFrom(queryEntity.getId(), Entity.QUERY, Relationship.USES, Entity.USER);
    for (CollectionDAO.EntityRelationshipRecord record : records) {
      queryUsers.add(new EntityReference().withId(record.getId()).withType(record.getType()));
    }
    return queryUsers;
  }

  @Override
  public void prepare(Query entity) throws IOException {
    try {
      if (CommonUtil.nullOrEmpty(entity.getName())) {
        byte[] checksum = MessageDigest.getInstance("MD5").digest(entity.getQuery().getBytes());
        entity.setChecksum(Hex.encodeHexString(checksum));
        entity.setName(entity.getChecksum());
      }
    } catch (NoSuchAlgorithmException e) {
      throw new RuntimeException(e);
    }
  }

  @Override
  public void storeEntity(Query queryEntity, boolean update) throws IOException {
    EntityReference owner = queryEntity.getOwner();
    List<EntityReference> queryUsage = queryEntity.getQueryUsedIn();
    List<EntityReference> queryUsers = queryEntity.getUsers();
    queryEntity.withQueryUsedIn(null).withOwner(null).withFollowers(null).withUsers(null);
    store(queryEntity, update);

    // Restore relationships
    queryEntity.withQueryUsedIn(queryUsage).withOwner(owner).withUsers(queryUsers);
  }

  @Override
  public void storeRelationships(Query queryEntity) throws IOException {
    // Store Query Users Relation
    if (queryEntity.getUsers() != null) {
      for (EntityReference entityRef : queryEntity.getUsers()) {
        addRelationship(entityRef.getId(), queryEntity.getId(), Entity.USER, Entity.QUERY, Relationship.USES);
      }
    }

    // Store Query Used in Relation
    if (queryEntity.getQueryUsedIn() != null) {
      for (EntityReference entityRef : queryEntity.getQueryUsedIn()) {
        addRelationship(
            entityRef.getId(), queryEntity.getId(), entityRef.getType(), Entity.QUERY, Relationship.MENTIONED_IN);
      }
    }

    // Add table owner relationship
    storeOwner(queryEntity, queryEntity.getOwner());

    // Add tag to table relationship
    applyTags(queryEntity);
  }

  @Override
  public EntityUpdater getUpdater(Query original, Query updated, Operation operation) {
    return new QueryUpdater(original, updated, operation);
  }

  public ResultList<Query> listQueriesByEntityId(
      String entityId, String entityType, String before, String after, int limit) {
    RestUtil.validateCursors(before, after);
    int totalQueryCount =
        daoCollection
            .queryDAO()
            .listQueryCount(entityId, entityType, Entity.QUERY, Relationship.MENTIONED_IN.ordinal());
    List<CollectionDAO.QueryList> queryList;
    if (before != null) {
      queryList =
          daoCollection
              .queryDAO()
              .listBeforeQueriesByEntityId(
                  entityId,
                  entityType,
                  Entity.QUERY,
                  RestUtil.decodeCursor(before),
                  limit + 1,
                  Relationship.MENTIONED_IN.ordinal());
    } else {
      queryList =
          daoCollection
              .queryDAO()
              .listAfterQueriesByEntityId(
                  entityId,
                  entityType,
                  Entity.QUERY,
                  after == null ? "" : RestUtil.decodeCursor(after),
                  limit + 1,
                  Relationship.MENTIONED_IN.ordinal());
    }
    ResultList<Query> queryResultList;
    if (before != null) {
      queryResultList = listBeforeQueries(queryList, limit, totalQueryCount);
    } else {
      queryResultList = listAfterQueries(after, queryList, limit, totalQueryCount);
    }
    return queryResultList;
  }

  private ResultList<Query> listBeforeQueries(List<CollectionDAO.QueryList> queryList, int limit, int total) {
    String beforeCursor = null;
    String afterCursor;
    if (queryList.size() > limit) { // If extra result exists, then previous page exists - return before cursor
      queryList.remove(0);
      beforeCursor = queryList.get(0).getFqn();
    }
    afterCursor = queryList.get(queryList.size() - 1).getFqn();
    List<Query> queries = new ArrayList<>();
    for (CollectionDAO.QueryList queryRow : queryList) {
      queries.add(queryRow.getQuery());
    }
    return new ResultList<>(queries, beforeCursor, afterCursor, total);
  }

  private ResultList<Query> listAfterQueries(
      String after, List<CollectionDAO.QueryList> queryList, int limit, int total) {
    String beforeCursor;
    String afterCursor = null;
    beforeCursor = after == null ? null : queryList.get(0).getFqn();
    if (queryList.size() > limit) { // If extra result exists, then next page exists - return after cursor
      queryList.remove(limit);
      afterCursor = queryList.get(limit - 1).getFqn();
    }
    List<Query> queries = new ArrayList<>();
    for (CollectionDAO.QueryList queryRow : queryList) {
      queries.add(queryRow.getQuery());
    }
    return new ResultList<>(queries, beforeCursor, afterCursor, total);
  }

  public Query addQueryUsage(UUID queryId, List<EntityReference> entityIds) throws IOException {
    Query query = Entity.getEntity(Entity.QUERY, queryId, "queryUsedIn", Include.NON_DELETED);
    entityIds.forEach(
        (entityRef) -> {
          addRelationship(entityRef.getId(), queryId, entityRef.getType(), Entity.QUERY, Relationship.MENTIONED_IN);
        });
    query.getQueryUsedIn().addAll(entityIds);
    return query;
  }

  public Query removeQueryUsedIn(UUID queryId, List<EntityReference> entityIds) throws IOException {
    Query query = Entity.getEntity(Entity.QUERY, queryId, "queryUsedIn", Include.NON_DELETED);
    for (EntityReference ref : entityIds) {
      deleteTo(queryId, Entity.QUERY, Relationship.MENTIONED_IN, ref.getType());
    }
    // TODO:
    return query;
  }

  public class QueryUpdater extends EntityUpdater {
    public QueryUpdater(Query original, Query updated, Operation operation) {
      super(original, updated, operation);
    }

    @Override
    public void entitySpecificUpdate() throws IOException {
      if (operation.isPatch()) {
        recordChange("vote", original.getVote(), updated.getVote());
      }
      updateFromRelationships(
          "users",
          Entity.USER,
          original.getUsers(),
          updated.getUsers(),
          Relationship.USES,
          Entity.QUERY,
          original.getId());
    }
  }
}

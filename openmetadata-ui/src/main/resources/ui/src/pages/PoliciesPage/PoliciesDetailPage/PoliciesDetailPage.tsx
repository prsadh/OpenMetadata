/*
 *  Copyright 2021 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Button,
  Collapse,
  Dropdown,
  Empty,
  Menu,
  Modal,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd';
import { ColumnsType } from 'antd/lib/table';
import { AxiosError } from 'axios';
import { compare } from 'fast-json-patch';
import { isEmpty, isUndefined, startCase, uniqueId } from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import {
  getPolicyByName,
  getRoleByName,
  patchPolicy,
  patchRole,
} from '../../../axiosAPIs/rolesAPIV1';
import { getTeamByName, patchTeamDetail } from '../../../axiosAPIs/teamsAPI';
import Description from '../../../components/common/description/Description';
import RichTextEditorPreviewer from '../../../components/common/rich-text-editor/RichTextEditorPreviewer';
import TitleBreadcrumb from '../../../components/common/title-breadcrumb/title-breadcrumb.component';
import Loader from '../../../components/Loader/Loader';
import {
  GlobalSettingOptions,
  GlobalSettingsMenuCategory,
} from '../../../constants/globalSettings.constants';
import { EntityType } from '../../../enums/entity.enum';
import { Rule } from '../../../generated/api/policies/createPolicy';
import { Policy } from '../../../generated/entity/policies/policy';
import { EntityReference } from '../../../generated/type/entityReference';
import { getEntityName } from '../../../utils/CommonUtils';
import {
  getAddPolicyRulePath,
  getEditPolicyRulePath,
  getRoleWithFqnPath,
  getSettingPath,
  getTeamsWithFqnPath,
} from '../../../utils/RouterUtils';
import SVGIcons, { Icons } from '../../../utils/SvgUtils';
import { showErrorToast } from '../../../utils/ToastUtils';
import './PoliciesDetail.less';

const { Panel } = Collapse;

const { TabPane } = Tabs;

type Attribute = 'roles' | 'teams';

const List = ({
  list,
  type,
  onDelete,
}: {
  list: EntityReference[];
  type: 'role' | 'team';
  onDelete: (record: EntityReference) => void;
}) => {
  const columns: ColumnsType<EntityReference> = useMemo(() => {
    return [
      {
        title: 'Name',
        dataIndex: 'name',
        width: '200px',
        key: 'name',
        render: (_, record) => {
          let link = '';
          switch (type) {
            case 'role':
              link = getRoleWithFqnPath(record.fullyQualifiedName || '');

              break;
            case 'team':
              link = getTeamsWithFqnPath(record.fullyQualifiedName || '');

              break;

            default:
              break;
          }

          return (
            <Link className="hover:tw-underline tw-cursor-pointer" to={link}>
              {getEntityName(record)}
            </Link>
          );
        },
      },
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        render: (_, record) => (
          <RichTextEditorPreviewer markdown={record?.description || ''} />
        ),
      },
      {
        title: 'Actions',
        dataIndex: 'actions',
        width: '80px',
        key: 'actions',
        render: (_, record) => {
          return (
            <Button
              data-testid={`remove-action-${getEntityName(record)}`}
              type="text"
              onClick={() => onDelete(record)}>
              <SVGIcons alt="remove" icon={Icons.ICON_REMOVE} title="Remove" />
            </Button>
          );
        },
      },
    ];
  }, []);

  return (
    <Table
      className="list-table"
      columns={columns}
      dataSource={list}
      pagination={false}
      size="middle"
    />
  );
};

const PoliciesDetailPage = () => {
  const history = useHistory();
  const { fqn } = useParams<{ fqn: string }>();

  const [policy, setPolicy] = useState<Policy>({} as Policy);
  const [isLoading, setLoading] = useState<boolean>(false);
  const [editDescription, setEditDescription] = useState<boolean>(false);
  const [selectedEntity, setEntity] =
    useState<{ attribute: Attribute; record: EntityReference }>();

  const policiesPath = getSettingPath(
    GlobalSettingsMenuCategory.ACCESS,
    GlobalSettingOptions.POLICIES
  );

  const breadcrumb = useMemo(
    () => [
      {
        name: 'Policies',
        url: policiesPath,
      },
      {
        name: fqn,
        url: '',
      },
    ],
    [fqn]
  );

  const fetchPolicy = async () => {
    setLoading(true);
    try {
      const data = await getPolicyByName(fqn, 'owner,location,teams,roles');
      setPolicy(data ?? ({} as Policy));
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setLoading(false);
    }
  };

  const handleDescriptionUpdate = async (description: string) => {
    const patch = compare(policy, { ...policy, description });
    try {
      const data = await patchPolicy(patch, policy.id);
      setPolicy({ ...policy, description: data.description });
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setEditDescription(false);
    }
  };

  const handleRolesUpdate = async (data: EntityReference) => {
    try {
      const role = await getRoleByName(
        data.fullyQualifiedName || '',
        'policies'
      );
      const updatedAttributeData = (role.policies ?? []).filter(
        (attrData) => attrData.id !== policy.id
      );

      const patch = compare(role, {
        ...role,
        policies: updatedAttributeData,
      });

      const response = await patchRole(patch, role.id);

      if (response) {
        const updatedRoles = (policy.roles ?? []).filter(
          (role) => role.id !== data.id
        );
        setPolicy((prev) => ({ ...prev, roles: updatedRoles }));
      }
    } catch (error) {
      showErrorToast(error as AxiosError);
    }
  };

  const handleTeamsUpdate = async (data: EntityReference) => {
    try {
      const team = await getTeamByName(
        data.fullyQualifiedName || '',
        'policies'
      );
      const updatedAttributeData = (team.policies ?? []).filter(
        (attrData) => attrData.id !== policy.id
      );

      const patch = compare(team, {
        ...team,
        policies: updatedAttributeData,
      });

      const response = await patchTeamDetail(team.id, patch);

      if (response) {
        const updatedTeams = (policy.teams ?? []).filter(
          (team) => team.id !== data.id
        );
        setPolicy((prev) => ({ ...prev, teams: updatedTeams }));
      }
    } catch (error) {
      showErrorToast(error as AxiosError);
    }
  };

  const handleDelete = async (data: EntityReference, attribute: Attribute) => {
    if (attribute === 'roles') {
      handleRolesUpdate(data);
    } else if (attribute === 'teams') {
      handleTeamsUpdate(data);
    } else {
      const attributeData =
        (policy[attribute as keyof Policy] as EntityReference[]) ?? [];
      const updatedAttributeData = attributeData.filter(
        (attrData) => attrData.id !== data.id
      );

      const patch = compare(policy, {
        ...policy,
        [attribute as keyof Policy]: updatedAttributeData,
      });
      try {
        const data = await patchPolicy(patch, policy.id);
        setPolicy(data);
      } catch (error) {
        showErrorToast(error as AxiosError);
      }
    }
  };

  const handleRuleDelete = async (data: Rule) => {
    const updatedRules = (policy.rules ?? []).filter(
      (rule) => rule.name !== data.name
    );

    const patch = compare(policy, { ...policy, rules: updatedRules });

    try {
      const data = await patchPolicy(patch, policy.id);
      setPolicy(data);
    } catch (error) {
      showErrorToast(error as AxiosError);
    }
  };

  const getRuleActionElement = useCallback(
    (rule: Rule) => {
      return (
        <Dropdown
          overlay={
            <Menu
              items={[
                {
                  label: (
                    <Button
                      className="tw-p-0"
                      data-testid="edit-rule"
                      type="text"
                      onClick={(e) => {
                        e.stopPropagation();
                        history.push(
                          getEditPolicyRulePath(fqn, rule.name || '')
                        );
                      }}>
                      <Space align="center">
                        <SVGIcons alt="edit" icon={Icons.EDIT} />
                        Edit
                      </Space>
                    </Button>
                  ),
                  key: 'edit-button',
                },
                {
                  label: (
                    <Button
                      className="tw-p-0"
                      data-testid="delete-rule"
                      type="text"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRuleDelete(rule);
                      }}>
                      <Space align="center">
                        <SVGIcons
                          alt="delete"
                          icon={Icons.DELETE}
                          width="16px"
                        />
                        Delete
                      </Space>
                    </Button>
                  ),
                  key: 'delete-button',
                },
              ]}
            />
          }
          placement="bottomRight"
          trigger={['click']}>
          <Button
            data-testid={`manage-button-${rule.name}`}
            size="small"
            type="text"
            onClick={(e) => {
              e.stopPropagation();
            }}>
            <FontAwesomeIcon
              className="tw-text-grey-body"
              icon="ellipsis-vertical"
            />
          </Button>
        </Dropdown>
      );
    },
    [policy]
  );

  useEffect(() => {
    fetchPolicy();
  }, [fqn]);

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div data-testid="policy-details-container">
      <TitleBreadcrumb titleLinks={breadcrumb} />
      {isEmpty(policy) ? (
        <Empty description={`No policy found for ${fqn}`}>
          <Button
            size="small"
            type="primary"
            onClick={() => history.push(policiesPath)}>
            Go Back
          </Button>
        </Empty>
      ) : (
        <div className="policies-detail" data-testid="policy-details">
          <div className="tw--ml-5">
            <Description
              description={policy.description || ''}
              entityFqn={policy.fullyQualifiedName}
              entityName={getEntityName(policy)}
              entityType={EntityType.POLICY}
              isEdit={editDescription}
              onCancel={() => setEditDescription(false)}
              onDescriptionEdit={() => setEditDescription(true)}
              onDescriptionUpdate={handleDescriptionUpdate}
            />
          </div>
          <Tabs defaultActiveKey="rules">
            <TabPane key="rules" tab="Rules">
              {isEmpty(policy.rules) ? (
                <Empty description="No rules found" />
              ) : (
                <Space className="tw-w-full tabpane-space" direction="vertical">
                  <Button
                    data-testid="add-rule"
                    type="primary"
                    onClick={() => history.push(getAddPolicyRulePath(fqn))}>
                    Add Rule
                  </Button>
                  <Space className="tw-w-full" direction="vertical" size={16}>
                    {policy.rules.map((rule) => (
                      <Collapse key={uniqueId()}>
                        <Panel
                          header={
                            <Space
                              className="tw-w-full"
                              direction="vertical"
                              size={4}>
                              <Space
                                align="baseline"
                                className="tw-w-full tw-justify-between"
                                size={4}>
                                <Typography.Text
                                  className="tw-font-medium tw-text-base tw-text-grey-body"
                                  data-testid="rule-name">
                                  {rule.name}
                                </Typography.Text>
                                {getRuleActionElement(rule)}
                              </Space>
                              <div
                                className="tw--ml-5"
                                data-testid="description">
                                <Typography.Text className="tw-text-grey-muted">
                                  Description:
                                </Typography.Text>
                                <RichTextEditorPreviewer
                                  markdown={rule.description || ''}
                                />
                              </div>
                            </Space>
                          }
                          key={rule.name || 'rule'}>
                          <Space direction="vertical" size={16}>
                            <Space
                              data-testid="resources"
                              direction="vertical"
                              size={4}>
                              <Typography.Text className="tw-text-grey-muted tw-mb-0">
                                Resources:
                              </Typography.Text>
                              <Typography.Text className="tw-text-grey-body">
                                {rule.resources
                                  ?.map((resource) => startCase(resource))
                                  ?.join(', ')}
                              </Typography.Text>
                            </Space>

                            <Space
                              data-testid="operations"
                              direction="vertical"
                              size={4}>
                              <Typography.Text className="tw-text-grey-muted">
                                Operations:
                              </Typography.Text>
                              <Typography.Text className="tw-text-grey-body">
                                {rule.operations?.join(', ')}
                              </Typography.Text>
                            </Space>
                            <Space
                              data-testid="effect"
                              direction="vertical"
                              size={4}>
                              <Typography.Text className="tw-text-grey-muted">
                                Effect:
                              </Typography.Text>
                              <Typography.Text className="tw-text-grey-body">
                                {startCase(rule.effect)}
                              </Typography.Text>
                            </Space>
                            {rule.condition && (
                              <Space
                                data-testid="condition"
                                direction="vertical"
                                size={4}>
                                <Typography.Text className="tw-text-grey-muted">
                                  Condition:
                                </Typography.Text>
                                <code>{rule.condition}</code>
                              </Space>
                            )}
                          </Space>
                        </Panel>
                      </Collapse>
                    ))}
                  </Space>
                </Space>
              )}
            </TabPane>
            <TabPane key="roles" tab="Roles">
              <List
                list={policy.roles ?? []}
                type="role"
                onDelete={(record) => setEntity({ record, attribute: 'roles' })}
              />
            </TabPane>
            <TabPane key="teams" tab="Teams">
              <List
                list={policy.teams ?? []}
                type="team"
                onDelete={(record) => setEntity({ record, attribute: 'teams' })}
              />
            </TabPane>
          </Tabs>
        </div>
      )}
      {selectedEntity && (
        <Modal
          centered
          okText="Confirm"
          title={`Remove ${getEntityName(
            selectedEntity.record
          )} from ${getEntityName(policy)}`}
          visible={!isUndefined(selectedEntity.record)}
          onCancel={() => setEntity(undefined)}
          onOk={() => {
            handleDelete(selectedEntity.record, selectedEntity.attribute);
            setEntity(undefined);
          }}>
          <Typography.Text>
            Are you sure you want to remove the{' '}
            {`${getEntityName(selectedEntity.record)} from ${getEntityName(
              policy
            )}?`}
          </Typography.Text>
        </Modal>
      )}
    </div>
  );
};

export default PoliciesDetailPage;
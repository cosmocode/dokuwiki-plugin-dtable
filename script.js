(function ($) {
    jQuery.fn.getStyleObject = function (styles) {
        var ret_style = {};
        for (var i = 0; i < styles.length; i++) {
            ret_style[styles[i]] = jQuery(this).css(styles[i]);
        }
        return ret_style;
    }
})(jQuery);


class DTable {

    toolbar_id = "dtable_tool__bar";

    /** @type {string} I need it to use dokuwiki toolbar */
    textarea_id = "dtable_wiki__text";

    /** @type {boolean} Set it to true if we are waiting for form to send */
    form_processing = false;

    /** @type {jQuery} Store informatin about actual clicked row */
    $row = null;

    /** @type {string} ID of processed dtable */
    id = "";

    /** @type {boolean} if page locked */
    page_locked = false;

    /**
     * State of the lock
     *
     * 0 -> we don't know anything
     * 1 -> someone locked the page and we're waiting until we can refresh it
     * 2 -> we can edit page for some time, but we left browser alone and our lock expires and someone else came and
     *      start to edit page, so we need to lock our page and optionally send the form.
     *
     * @type {int}
     */
    lock_state = 0;

    /**
     * Used to determine if the user is doing something by tracking mouse position
     *
     * @type {object}
     * @property {int} pageX
     * @property {int} pageY
     * @property {int} prev_pageX
     * @property {int} prev_pageY
     */
    tracker = {
        pageX: 0,
        pageY: 0,
        prev_pageX: 0,
        prev_pageY: 0,
    };

    /** @type {string} check if forms in dtable are changed */
    prev_val = '';

    /** @type {int} When my or someone's else lock expires */
    lock_expires = -1;

    /** All intervals */
    intervals = [];

    lock_seeker_timeout = 5 * 1000;

    /**
     * Show an error to the user
     *
     * @param {string} msg
     */
    error(msg) {
        alert(msg);
    };

    /**
     * Insert our form into the table
     *
     * @param {jQuery} $table
     */
    show_form($table) {
        const $form = $table.find(".form_row");
        const $toolbar = jQuery("#" + this.toolbar_id);

        //display fix jquery 1.6 bug
        $form.css("display", "table-row");

        $form.find("textarea.dtable_field").each(function () {

            //this is merged cell
            const button = jQuery(this).closest('td').find('button');
            if (button.length > 0) {
                const button_width = 31;
                const text_off = jQuery(this).offset();
                const scroller_width = 20;

                const button_off = button.offset();
                button.css({
                    'position': 'absolute',
                    'top': text_off.top,
                    'left': button_off.left + jQuery(this).width() - button_width - scroller_width
                }).appendTo('body');
            }
        });

        //calculate texarea.rowspans positions
        const textarea_offset = $form.find('textarea.dtable_field').first().offset();

        $table.find('textarea.dtable_field:not(.form_row textarea.dtable_field)').each(function () {
            var this_texta_offset = jQuery(this).offset();
            jQuery(this).css('top', textarea_offset.top - this_texta_offset.top);
        });

        const offset = $form.offset();
        $toolbar.css({
            'left': offset.left,
            'top': offset.top - $toolbar.height()
        });
        $toolbar.show();
    }

    /**
     * Remove the form from the table
     *
     * @param {jQuery} $table
     */
    hide_form($table) {
        const $form = $table.find('.form_row');
        //remove form
        $form.remove();
        //remove textareas in rowspans
        $table.find("textarea.dtable_field").remove();

        jQuery('.dtable_unmerge').remove();

        const $toolbar = jQuery(`#${this.toolbar_id}`);
        $form.hide();
        $toolbar.hide();
    }

    /**
     * Get all editable rows from the table
     *
     * @param {jQuery} $table
     * @returns {jQuery}
     */
    get_data_rows($table) {
        //.not(".form_row") is nesssesery
        return $table.find("tr").not(".form_row");//.not(":hidden");
    }

    /**
     * Get the row id (aka index) of the row in the table
     *
     * @param {jQuery} $table
     * @param {jQuery} $row
     * @returns {int}
     */
    get_row_id($table, $row) {
        return this.get_data_rows($table).index($row);
    }

    /**
     * Get the currently set call
     *
     * @param {jQuery} $form
     * @returns {string}
     */
    get_call($form) {
        return $form.find("input.dtable_field[name=call]").val();
    };

    /**
     * Lock the current page
     */
    lock() {
        jQuery.post(
            DOKU_BASE + 'lib/exe/ajax.php',
            {
                'call': 'dtable_page_lock',
                'page': JSINFO['id'],
            },
            () => {
                this.page_locked = true
            } // success
        );
    };

    /**
     * Unlock the current page
     */
    unlock() {
        if (this.page_locked) {
            jQuery.post(
                DOKU_BASE + 'lib/exe/ajax.php',
                {
                    'call': 'dtable_page_unlock',
                    'page': JSINFO['id'],
                },
                () => {
                    this.page_locked = false
                } // success
            );
        }
    };

    /**
     * Toggle the panlock state
     *
     * @param {string} state
     */
    panlock_switch(state) {
        if (state === undefined) {
            state = 'hide';
        }


        if (state === 'panlock') {
            jQuery(".dtable .panunlock").hide();
            jQuery(".dtable .panlock").show();
        } else if (state === 'panunlock') {
            jQuery(".dtable .panlock").hide();
            jQuery(".dtable .panunlock").show();
        } else {
            jQuery(".dtable .panlock").hide();
            jQuery(".dtable .panunlock").hide();
        }
    };

    lock_seeker(nolock, lock) {
        jQuery.post(DOKU_BASE + 'lib/exe/ajax.php',
            {
                'call': 'dtable_is_page_locked',
                'page': JSINFO['id'],
            },
            (data) => {
                const res = jQuery.parseJSON(data);

                this.lock_expires = res.time_left;

                if (res.locked === 1) {
                    if (this.lock_state === 2) {
                        this.lock();
                    }

                    jQuery('.dtable .panlock .who').text(res.who);
                    this.update_lock_timer(this.lock_expires);
                    this.panlock_switch('panlock');
                    this.lock_state = 1;
                } else {
                    this.panlock_switch('hide');
                    if (this.lock_state === 0) {
                        nolock();
                    } else if (this.lock_state === 1) {
                        this.panlock_switch('panunlock');
                        this.clear_all_intervals();
                    }

                    this.lock_state = 2;

                    // refresh lock if user does something
                    let form_val_str = '';
                    jQuery('.dtable .form_row').find('textarea.dtable_field').each(function () {
                        form_val_str += jQuery(this).val();
                    });
                    if (
                        this.tracker.pageX !== this.tracker.prev_pageX ||
                        this.tracker.pageY !== this.tracker.prev_pageY ||
                        this.prev_val !== form_val_str
                    ) {
                        this.tracker.prev_pageX = this.tracker.pageX;
                        this.tracker.prev_pageY = this.tracker.pageY;
                        this.prev_val = form_val_str;
                        this.lock();
                    }
                }
            });
    }

    /**
     *
     * @param {int} seconds
     */
    update_lock_timer(seconds) {
        const date = new Date();
        date.setSeconds(date.getSeconds() + seconds);
        jQuery(".dtable .panlock .time_left").text(date.toLocaleString());
    };

    /**
     * Registers the event handlers
     * @fixme weird naming
     */
    unlock_dtable() {
        const $dtable = jQuery('.dtable');
        const $row = this.get_data_rows($dtable);
        const $context_menu = jQuery('#dtable_context_menu');
        const $body = jQuery('body');


        this.lock();

        //track mouse in order to check if user do somenhing
        jQuery(document).bind('mousemove', (e) => {
            this.tracker.pageX = e.pageX;
            this.tracker.pageY = e.pageY;
        });

        $row.find("td, th").bind('contextmenu', this.row_mousedown.bind(this));

        jQuery(document).bind('mouseup', (e) => {
            if (e.which === 1) {
                $context_menu.hide();
            }
        });

        //prevent unmerge button from sending form
        $body.delegate('.dtable_unmerge', 'dblclick', (e) => {
            e.stopPropagation();
        });

        //prevent outer texarea from sending form
        $dtable.delegate('textarea.dtable_field', 'dblclick', (e) => {
            e.stopPropagation();
        });

        //This was previously at the bottom of init function
        $dtable.delegate('.form_row', 'dblclick', (e) => {
            e.stopPropagation();
        });

        $body.delegate(`#${this.toolbar_id}`, 'dblclick', (e) => {
            e.stopPropagation();
        });

        jQuery(document).dblclick(() => {
            //send form only once
            if (this.form_processing === false) {
                this.form_processing = true;
                //$context_menu.hide();
                if (jQuery('.dtable .form_row').find(':visible').length > 0) {
                    $dtable.submit();
                }
            }
        });
    };

    /**
     * Unregister eventhandlers
     *
     * @fixme weird naming
     */
    lock_dtable() {
        const $row = this.get_data_rows(jQuery('.dtable'));

        jQuery(document).unbind('mousemove');
        $row.find('td, th').unbind('contextmenu');

        jQuery("#dtable_context_menu").hide();
    };

    /**
     * Event handler to show context menu on rows
     *
     * @param {MouseEvent} e
     */
    row_mousedown(e) {
        const $this_cell = jQuery(e.target);
        const $this_row = $this_cell.closest('tr');
        const $context_menu = jQuery('#dtable_context_menu');

        $context_menu.html('');

        //remove disabled actions
        const context_actions = jQuery(['insert_before', 'insert_after', 'edit', 'remove'])
            .not(JSINFO['disabled']).get();


        for (const item_index in context_actions) {
            const item = context_actions[item_index];
            jQuery(`<li class="${item}">`).html(`<a href="#${item}">${JSINFO['lang'][item]}`).appendTo($context_menu);
        }
        $context_menu.find('li.edit').addClass('separator');
        $context_menu.find('li.insert_col_left').addClass('separator');
        $context_menu.find('li.mark_row_as_header').addClass('separator');

        const offsetX = e.pageX + 1;
        const offsetY = e.pageY + 1;


        $context_menu.show();
        $context_menu.css('top', offsetY);
        $context_menu.css('left', offsetX);

        this.$row = $this_row;
        e.preventDefault();

    };

    /**
     * Remove all registerd intervals
     */
    clear_all_intervals() {
        for (const i in this.intervals) {
            clearInterval(this.intervals[i]);
        }
    };

    /**
     * Handle row and col spans
     *
     * @fixme explain what this does
     * @param {jQuery} $table
     * @param {array} spans
     */
    change_rows($table, spans) {
        $table.find('tr').each(function (index) {
            jQuery(this).find('td, th').each(function (td_ind) {
                if (spans[index][td_ind][0] !== 1) {
                    jQuery(this).attr('colspan', spans[index][td_ind][0]);
                } else {
                    jQuery(this).removeAttr('colspan');
                }

                if (spans[index][td_ind][1] !== 1) {
                    jQuery(this).attr('rowspan', spans[index][td_ind][1]);
                } else {
                    jQuery(this).removeAttr('rowspan');
                }
            });
        });
    };

    /**
     * Get the ID of this dtable form
     *
     * @param {jQuery} $form
     * @returns {string}
     */
    get_table_id($form) {
        const table = $form.attr("id");
        return table.replace(/^dtable_/, '');
    };

    /**
     * Creates the edit form
     *
     * @param {jQuery} $form
     * @param {jQuery} $row
     * @param {string} action
     * @param value
     * @param row_data
     * @param colspan_callback
     * @param mod_cell_callback
     * @fixme this needs to be broken down into smaller functions
     */
    new_build_form($form, $row, action, value, row_data, colspan_callback, mod_cell_callback = null) {
        const $form_row = jQuery('<tr class="form_row">').hide().appendTo($form.find("table"));

        if ($form.find("input.dtable_field.dtable_action").length > 0) {
            jQuery($form).find("input.dtable_field.dtable_action").attr("name", action).val(JSON.stringify(value));
            jQuery($form).find("input.dtable_field[name=table]").val(this.get_table_id($form));

        } else {
            //append dtable_action
            jQuery($form).append('<input type="hidden" class="dtable_action dtable_field" name="' + action + '" value="' + JSON.stringify(value) + '">');
            //append table name
            jQuery($form).append('<input type="hidden" class="dtable_field" name="table" value="' + this.get_table_id($form) + '">');
        }

        const rowspans = [];
        const rowspans_keys = [];
        let rows_after = 0;

        //found rowspans mother cells //FIXME this was probably not working before. we might be able to drop it
        this.$row.next().prevAll().each(
            function () {
                jQuery(this).find("td, th").each(function () {
                    var rowspan = jQuery(this).attr("rowspan");
                    if (typeof rowspan !== 'undefined' && rowspan !== false && parseInt(rowspan) > rows_after) {
                        var ind = jQuery(this).index();
                        rowspans[ind] = jQuery(this);
                        rowspans_keys.push(ind);
                    }
                });
                rows_after++;
            });
        rowspans_keys.sort();


        let td_index = 0;
        let col = 0;
        let rowsp_cell_ind = 0;

        let cells = row_data[0];

        for (let i = 0; i < cells.length; i++) {
            let tclass = (cells[i][2] === '^') ? 'tableheader_open' : 'tablecell_open';
            let colspan = cells[i][0];
            let rowspan = cells[i][1];
            let content = cells[i][3];

            const $father_cell = $row.find("td, th").eq(td_index);
            //var rowspan = $father_cell.attr('rowspan');

            if (mod_cell_callback !== null) {
                const mod = mod_cell_callback.call(this, tclass, rowspan, colspan, content);

                tclass = mod[0];
                rowspan = mod[1];
                colspan = mod[2];
                content = mod[3];
            }

            if (jQuery.trim(content) === ':::') {
                const $mother_cell = rowspans[rowspans_keys[rowsp_cell_ind]];
                let width = $mother_cell.width();
                if (width < 20) width = 20;
                rowsp_cell_ind++;
                jQuery('<textarea class="' + tclass + ' rowspans dtable_field" name="col' + col + '">')
                    .val(content)
                    .width(width)
                    .css({
                        'position': 'relative',
                        'display': 'block'
                    })
                    .appendTo($mother_cell);
                col++;
                if ($mother_cell.get(0) === $father_cell.get(0)) td_index++;
            } else {
                const width = Math.min($father_cell.width(), 80);
                const height = Math.min($father_cell.height(), 40);

                if (colspan > 1) {
                    col = colspan_callback.call(this, $form_row, colspan, width, height, tclass, col, content);
                    td_index++;

                } else {

                    const $form_cell = jQuery('<td>').attr({rowspan: rowspan});
                    jQuery('<textarea class="' + tclass + ' dtable_field" name="col' + col + '">')
                        .val(content)
                        .width(width)
                        .height(height)
                        .appendTo($form_cell);

                    td_index++;
                    col++;

                    $form_row.append($form_cell);
                }
            }

        }
        $form.find('textarea.dtable_field').first().attr('id', this.textarea_id);

        const $toolbar = jQuery(`#${this.toolbar_id}`);
        if ($toolbar.is(':empty')) {
            initToolbar(this.toolbar_id, this.textarea_id, toolbar);
        }
    };

    /**
     *
     * @fixme explain
     * @param {jQuery} $form
     * @param id
     * @returns {string}
     */
    get_lines($form, id) {
        const rows_data = $form.data('table');
        return JSON.stringify(rows_data[id][1]);
    };

    /**
     * Remove the given row
     *
     * @param {jQuery} $this_row
     */
    remove($this_row) {
        const $form = $this_row.closest('form');
        const $table = $form.find('table');

        const id = this.get_row_id($table, $this_row);
        jQuery.post(DOKU_BASE + 'lib/exe/ajax.php',
            {
                'call': this.get_call($form),
                'table': this.get_table_id($form),
                'remove': this.get_lines($form, id)
            },
            (data) => {
                const res = jQuery.parseJSON(data);
                if (res.type === 'success') {
                    const rows_data = $form.data('table');
                    const length = rows_data[id][1][1] - rows_data[id][1][0] + 1;
                    rows_data.splice(id, 1);

                    $form.data('table', rows_data);

                    $this_row.remove();

                    for (var i = id; i < rows_data.length; i++) {
                        rows_data[i][1][0] -= length;
                        rows_data[i][1][1] -= length;
                    }
                    $form.data('table', rows_data);

                    //change rows in case of rowspan
                    this.change_rows($table, res.spans);
                } else {
                    this.error(res.msg);
                }
            });
    };

    /**
     * @fixme explain
     * @fixme split into multiple functions
     * @fixme finish cleanup
     * @param {Event} e
     */
    contex_handler(e) {
        e.preventDefault();

        const insert_colspan_callback =
            function ($form_row, colspan, width, height, tclass, col) {
                width /= colspan;
                for (var j = 0; j < colspan; j++) {
                    jQuery('<textarea class="' + tclass + ' dtable_field" name="col' + col + '">')
                        .val('')
                        .width(width)
                        .height(height)
                        .appendTo(jQuery('<td>').appendTo($form_row));
                    col++;
                }
                return col;
            };

        const $this_row = this.$row;
        this.id = $this_row.closest(".dtable").attr("id");

        let row_id = $this_row.attr("id");
        let $table = $this_row.closest("table");
        let $form = $this_row.closest("form");
        let rows_data;
        let rows;

        //hide current form FIXME comment makes no sense?
        const ev = jQuery(e.target).attr("href");

        //check any form in any table
        jQuery(".form_row").each((index, elem) => {
            const $this_table = jQuery(elem).closest('table');
            $this_table.find('tr:hidden').show();
            this.hide_form($this_table);
        });

        switch (ev) {
            case '#remove':
                this.remove($this_row);
                break;
            case '#edit':

                row_id = this.get_row_id($table, $this_row);
                rows_data = $form.data("table");
                rows = rows_data[row_id];

                this.new_build_form($form, $this_row, "edit", rows[1], rows,
                    function ($form_row, colspan, width, height, tclass, col, content) {
                        const $form_cell = jQuery('<td>').attr({'colspan': colspan});

                        var $button = jQuery('<button class="toolbutton dtable_unmerge" title="' + ((JSINFO['lang']['show_merged_rows']).replace("%d", colspan - 1)) + '"><img width="16" height="16" src="lib/plugins/dtable/images/unmerge.png"></button>').appendTo($form_cell);

                        $form_row.append($form_cell);

                        var textareas = [];
                        jQuery('<textarea class="' + tclass + ' dtable_field" name="col' + col + '">').val(content).width(width).height(height).appendTo($form_cell);
                        textareas.push(col);
                        col++;
                        for (var j = 1; j < colspan; j++) {
                            jQuery('<textarea class="' + tclass + ' dtable_field" name="col' + col + '">').val('').width(width).height(height).appendTo(jQuery('<td>').hide().appendTo($form_row));
                            textareas.push(col);
                            col++;
                        }

                        $button.data('textareas', textareas);
                        $button.data('colspan', colspan);

                        $button.click(function () {
                            var textareas = jQuery(this).data('textareas');
                            var colspan = jQuery(this).data('colspan');

                            var $mother = $form.find("textarea.dtable_field[name=col" + textareas[0] + "]");
                            $mother.closest('td').attr('colspan', 0);
                            var width = $mother.width() / colspan;
                            var tdwidth = $mother.closest('td').width() / colspan;
                            var height = $mother.height();
                            for (var i = 0; i < textareas.length; i++) {
                                var $elm = $form.find("textarea.dtable_field[name=col" + textareas[i] + "]");
                                $elm.closest('td').show();
                                $elm.width(width).height(height);
                            }
                            jQuery(this).remove();
                        });
                        return col;
                    });
                $this_row.after($table.find(".form_row"));

                $this_row.hide();
                this.show_form($table);

                break;
            case '#insert_after':
                row_id = this.get_row_id($table, $this_row);

                row_id = this.get_row_id($table, $this_row);
                rows_data = $form.data("table");
                rows = rows_data[row_id];

                this.new_build_form($form, $this_row, "add", rows[1][1], rows,
                    insert_colspan_callback,
                    function (cclass, rowspan, colspan, value) {
                        if (jQuery.trim(value) !== ':::')
                            value = '';
                        if (typeof rowspan !== 'undefined' && rowspan !== false && rowspan > 1) {
                            rowspan = 1;
                            value = ':::'
                        }

                        cclass = 'tablecell_open';
                        return [cclass, rowspan, colspan, value];
                    });

                var $form_row = $table.find(".form_row");

                $this_row.after($form_row);
                this.show_form($table);
                break;
            case '#insert_before':

                var $form_row = $table.find(".form_row");

                rows_data = $form.data("table");

                var $before_elm = $this_row.prev();


                if ($before_elm.length != 0) {
                    var bef_row_id = this.get_row_id($table, $before_elm);
                    var add = rows_data[bef_row_id][1][1];
                    var first_elm = false;
                } else {
                    var add = rows_data[0][1][1];
                    var first_elm = true;
                }

                rows = rows_data[this.get_row_id($table, $this_row)];

                if (first_elm == true) {
                    var mod_row_call =
                        function (cclass, rowspan, colspan, value) {
                            if (jQuery.trim(value) !== ':::')
                                value = '';
                            if (typeof rowspan !== 'undefined' && rowspan !== false && rowspan > 1) {
                                rowspan = 1;
                                value = ''
                            }

                            cclass = 'tablecell_open';
                            return [cclass, rowspan, colspan, value];
                        };
                } else {
                    var mod_row_call =
                        function (cclass, rowspan, colspan, value) {
                            if (jQuery.trim(value) !== ':::')
                                value = '';
                            if (typeof rowspan !== 'undefined' && rowspan !== false && rowspan > 1) {
                                rowspan = 1;
                                value = ':::'
                            }

                            cclass = 'tablecell_open';
                            return [cclass, rowspan, colspan, value];
                        };
                }

                this.new_build_form($form, $this_row, "add", add, rows,
                    insert_colspan_callback, mod_row_call);

                $this_row.before($table.find(".form_row"));
                this.show_form($table);
                break;
        }
        jQuery(e.target).closest("#dtable_context_menu").hide();
    };

    init() {
        //create panlock elm
        jQuery('<div class="panlock notify">').html(JSINFO['lang']['lock_notify']).hide().prependTo(".dtable");

        //create panunlock elm
        jQuery('<div class="panunlock notify">').html(JSINFO['lang']['unlock_notify']).hide().prependTo(".dtable");


        //update lock expires
        this.intervals.push(setInterval(() => {
            this.lock_expires -= 1;
            if (this.lock_expires <= -1)
                return;

            if (this.lock_expires === 0) {
                //we had own lock
                if (this.page_locked === 1) {
                    //clear all intervals
                    this.clear_all_intervals();

                    //page is locked
                    this.page_locked = 0;

                    var $forms = jQuery('.dtable .form_row:visible').closest('form');
                    $forms.submit();

                    //after submitting form
                    this.lock_dtable();
                    this.panlock_switch('panunlock');
                } else {
                    //unblock us if someones lock expires
                    this.lock_seeker();
                }
            }
            this.update_lock_timer(this.lock_expires);
        }, 1000));


        jQuery("body").append('<div id="' + this.toolbar_id + '" style="position:absolute;display:none;z-index:999"></div>');

        jQuery.ui.dialog.prototype._oldcreate = jQuery.ui.dialog.prototype._create;
        jQuery.extend(jQuery.ui.dialog.prototype, {
            _init: function () {
                //This must be done to have correct z-index bahaviour in monobook template
                var lin_wiz = jQuery("#link__wiz");
                lin_wiz.appendTo("body");
                this._oldcreate();
            }
        });


        //create empty context menu - it will be filled with context before displaying
        var $context_menu = jQuery('<ul id="dtable_context_menu">').prependTo("body");


        $context_menu.delegate("a", "click", this.contex_handler.bind(this));


        this.lock_seeker(this.unlock_dtable.bind(this), this.lock_dtable.bind(this));

        this.intervals.push(setInterval(() => {
            this.lock_seeker(this.unlock_dtable.bind(this), this.lock_dtable.bind(this));
        }, this.lock_seeker_timeout));


        //Add is set on id of element after we want to add new element if set to -1 we adding element at the top of the table
        jQuery(".dtable").submit(
            (e) => {
                var $form = jQuery(e.target);
                if ($form.attr("id") === this.id) {
                    /*this.form_processing = true;*///Now form_processing is in dblclick func
                    const $elem = jQuery(e.target);
                    var data = {};
                    var action = $elem.find("input.dtable_field.dtable_action").attr("name");
                    var any_data = false;
                    $elem.find("textarea.dtable_field, input.dtable_field").each(
                        (index, elem) => {
                            const $elem = jQuery(elem);

                            //if row is empty it isn't submited during adding and it's deleted during editing
                            if ($elem.attr("class") != null && $elem.attr("name").indexOf("col") === 0) {
                                if ($elem.val() !== "" && jQuery.trim($elem.val()) !== ':::')
                                    any_data = true;
                                data[$elem.attr("name")] = JSON.stringify([$elem.hasClass("tableheader_open") ? "tableheader_open" : "tablecell_open", $elem.val()]);
                            } else
                                data[$elem.attr("name")] = $elem.val();
                        });

                    if (any_data === true) {
                        jQuery.post(DOKU_BASE + 'lib/exe/ajax.php',
                            data,
                            (data) => {
                                var res = jQuery.parseJSON(data);
                                if (res.type === 'success') {

                                    if (res.new_row !== undefined) {
                                        //remove old element
                                        if (action === "edit")
                                            $form.find(".form_row").prev().remove();

                                        var $table = $form.find("table");

                                        $new_elm = jQuery('<tr>');
                                        $new_elm.html(res.new_row);

                                        $form.find(".form_row").after($new_elm);
                                        if (this.page_locked === 1)
                                            $new_elm.find("td, th").bind("contextmenu", this.row_mousedown);

                                        var index = this.get_row_id($table, $new_elm);

                                        var raw_rows = $form.data('table');

                                        if (res.action === 'edit') {
                                            old_row = raw_rows[index];
                                            raw_rows[index] = res.raw_row;
                                            diff = old_row[1][1] - old_row[1][0];
                                            for (let i = index + 1; i < raw_rows.length; i++) {
                                                raw_rows[i][1][0] -= diff;
                                                raw_rows[i][1][1] -= diff;
                                            }
                                        } else {
                                            raw_rows.splice(index, 0, res.raw_row);
                                            diff = res.raw_row[1][1] - res.raw_row[1][0] + 1;
                                            for (let i = index + 1; i < raw_rows.length; i++) {
                                                raw_rows[i][1][0] += diff;
                                                raw_rows[i][1][1] += diff;
                                            }
                                        }
                                        $form.data('table', raw_rows);
                                    }

                                    this.hide_form($form);

                                    var $table = $form.find("table");
                                    this.change_rows($table, res.spans);

                                } else {
                                    this.error(res.msg);
                                }
                                this.form_processing = false;
                            });
                    } else {
                        if (action === "edit") {
                            $this_row = $form.find(".form_row").prev();
                            this.remove($this_row);
                            $this_row.remove();
                        }
                        this.hide_form($form);
                        this.form_processing = false;
                    }
                }
                return false;
            });
        jQuery(".dtable").delegate('textarea.dtable_field', 'focus', (e) => {
            const $elem = jQuery(e.target);
            this.id = $elem.closest(".dtable").attr("id");

            if ($elem.attr("id") != this.textarea_id) {
                $marked_textarea = jQuery(`#${this.textarea_id}`);

                $marked_parent = $marked_textarea.parent();
                $this_parent = $elem.parent();

                this_val = $elem.val();
                marked_val = $marked_textarea.val();
                $elem.val(marked_val);
                $marked_textarea.val(this_val);

                this_name = $elem.attr("name");
                marked_name = $marked_textarea.attr("name");
                $elem.attr("name", marked_name);
                $marked_textarea.attr("name", this_name);

                this_class = $elem.attr("class");
                marked_class = $marked_textarea.attr("class");
                $elem.attr("class", marked_class);
                $marked_textarea.attr("class", this_class);

                this_width = $elem.width();
                marked_width = $marked_textarea.width();

                this_height = $elem.height();
                marked_height = $marked_textarea.height();

                //get styles
                var this_style = $elem.getStyleObject(['position', 'top', 'left', 'display']);
                var marked_style = $marked_textarea.getStyleObject(['position', 'top', 'left', 'display']);
                $elem.css(marked_style);
                $marked_textarea.css(this_style);


                //correct width and height
                $elem.width(marked_width);
                $marked_textarea.width(this_width);

                $elem.height(marked_height);
                $marked_textarea.height(this_height);


                $marked_parent.append(jQuery(this));
                $this_parent.append($marked_textarea);

                $marked_textarea.show();

                jQuery(`#${this.textarea_id}`).focus();

            }

        });


    };
}

jQuery(document).ready(
    function () {
        //load images
        new Image('lib/plugins/dtable/images/unmerge.png');
        //check permission and if any dtable exists
        if (JSINFO['write'] === true && jQuery(".dtable").length > 0) {
            const dtable = new DTable();
            dtable.init();

            jQuery(window).on('unload', dtable.unlock);
        }
    }
);

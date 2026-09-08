
import './styles/quasar.sass'
import lang from 'quasar/lang/es.js'
import '@quasar/extras/material-icons/material-icons.css'
import { Notify } from 'quasar'
import { QBtn, QCard, QToolbar, QInput, QToolbarTitle, QCardSection, QIcon, QTooltip, QChip,
        QLinearProgress, QCircularProgress, QTree, QSelect, QItemSection, QItem, QBadge, QAvatar, QItemLabel,
        QList, QBanner, QFabAction, QCardActions, QFab, QSlideTransition, QSpace, QBtnGroup,
        QDialog, QPage, QSpinner, QCheckbox, QTable, QTh, QTr, QTd, QBtnToggle, QTabPanels, QTabPanel, QTabs, QTab, QSeparator, Loading,
        QSpinnerDots, QSpinnerGears, QBar, QPopupEdit, QDate, QToggle, QMenu, QPopupProxy
 } from 'quasar'

// To be used on app.use(Quasar, { ... })
export default {
  config: {},
  plugins: [ Loading, Notify],
  lang: lang,
  components: { QBtn, QCard, QToolbar, QInput, QToolbarTitle, QCardSection, QIcon, QTooltip, QChip,
    QLinearProgress, QCircularProgress, QTree, QSelect, QItemSection, QItem, QBadge, QAvatar, QItemLabel,
    QList, QBanner, QFabAction, QCardActions, QFab, QSlideTransition, QSpace, QBtnGroup,
    QDialog, QPage, QSpinner, QCheckbox, QTable, QTh, QTr, QTd, QBtnToggle, QTabPanels, QTabPanel, QTabs, QTab, QSeparator,
    QSpinnerDots, QSpinnerGears, QBar, QPopupEdit, QDate, QToggle, QMenu, QPopupProxy
   }
}
